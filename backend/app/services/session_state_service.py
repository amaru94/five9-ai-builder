"""In-memory session state store and reconfirmation prompt generation."""

from datetime import datetime
from typing import Any

from app.core.logging import get_logger
from app.models.session_state import SessionState
from app.services.skill_registry import get_registry

logger = get_logger(__name__)


class SessionStateService:
    """Stores session state and generates reconfirmation prompts for confirm_on_new_session fields."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def get(self, session_id: str) -> SessionState | None:
        """Return session state or None."""
        return self._sessions.get(session_id)

    def get_or_create(self, session_id: str) -> SessionState:
        """Return existing session or create new one."""
        if session_id in self._sessions:
            return self._sessions[session_id]
        state = SessionState(session_id=session_id)
        self._sessions[session_id] = state
        logger.info("session_created", extra={"session_id": session_id})
        return state

    def update(
        self,
        session_id: str,
        *,
        customer_context: dict[str, Any] | None = None,
        inputs: dict[str, Any] | None = None,
        last_confirmed_state: dict[str, Any] | None = None,
        run_id: str | None = None,
    ) -> SessionState:
        """Update session; merge into existing. Returns updated state."""
        state = self.get_or_create(session_id)
        if customer_context is not None:
            state.customer_context.update(customer_context)
        if inputs is not None:
            state.inputs.update(inputs)
        if last_confirmed_state is not None:
            state.last_confirmed_state = last_confirmed_state
        if run_id is not None:
            state.run_ids.append(run_id)
        state.updated_at = datetime.utcnow()
        logger.info(
            "session_state_reuse",
            extra={"session_id": session_id, "run_id": run_id},
        )
        return state

    def build_reconfirmation_prompt(
        self,
        session_id: str,
        confirm_fields: list[str],
    ) -> str | None:
        """
        If session has prior state for confirm_fields, return a prompt like:
        "I have the previous setup as Power dialing, 12 agents, ... Is that still correct?"
        Otherwise return None.
        """
        state = self.get(session_id)
        if not state:
            return None
        # Prefer last_confirmed_state, then customer_context, then inputs
        source = (state.last_confirmed_state or {}) or state.customer_context or state.inputs
        parts = []
        for key in confirm_fields:
            if key in source and source[key] is not None and str(source[key]).strip() != "":
                parts.append(f"{key}={source[key]}")
        if not parts:
            return None
        logger.info(
            "confirmation_request",
            extra={"session_id": session_id, "fields": confirm_fields, "values": parts},
        )
        return (
            "I have the previous setup as "
            + ", ".join(parts)
            + ". Is that still correct before I continue?"
        )

    def get_fields_to_confirm_for_skills(self, skill_ids: list[str]) -> list[str]:
        """Return input keys marked confirm_on_new_session across the given skills."""
        registry = get_registry()
        keys: list[str] = []
        seen: set[str] = set()
        for skill_id in skill_ids:
            skill = registry.get(skill_id)
            if not skill:
                continue
            for spec in skill.required_inputs + skill.optional_inputs:
                if getattr(spec, "confirm_on_new_session", False) and spec.key not in seen:
                    seen.add(spec.key)
                    keys.append(spec.key)
        return keys

    def get_reconfirmation_prompt(self, session_id: str, skill_ids: list[str]) -> str | None:
        """Build reconfirmation prompt for session using fields marked confirm_on_new_session in the given skills."""
        fields = self.get_fields_to_confirm_for_skills(skill_ids)
        if not fields:
            return None
        return self.build_reconfirmation_prompt(session_id, fields)

    def get_reconfirmation_state(self, session_id: str, skill_ids: list[str]) -> dict[str, Any] | None:
        """Return current state for confirm_on_new_session fields (for UI to show before confirming)."""
        state = self.get(session_id)
        if not state:
            return None
        fields = self.get_fields_to_confirm_for_skills(skill_ids)
        if not fields:
            return None
        source = (state.last_confirmed_state or {}) or state.customer_context or state.inputs
        return {k: source.get(k) for k in fields if k in source}
