"""Sessions API: get session, confirm state, reconfirmation helpers."""

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.services.session_state_service import SessionStateService

router = APIRouter(prefix="/sessions", tags=["sessions"])

_sessions: SessionStateService | None = None


def _get_sessions() -> SessionStateService:
    global _sessions
    if _sessions is None:
        _sessions = SessionStateService()
    return _sessions


@router.get("/{session_id}/reconfirmation-fields", response_model=dict[str, Any])
def get_reconfirmation_fields(session_id: str, skill_ids: str = Query(..., description="Comma-separated skill ids")) -> dict[str, Any]:
    """Return input keys marked confirm_on_new_session for the given skills, and current values if session exists."""
    svc = _get_sessions()
    ids = [s.strip() for s in skill_ids.split(",") if s.strip()]
    fields = svc.get_fields_to_confirm_for_skills(ids)
    state = svc.get_reconfirmation_state(session_id, ids)
    return {"skill_ids": ids, "fields_to_confirm": fields, "current_state": state}


@router.get("/{session_id}/reconfirmation-prompt", response_model=dict[str, Any])
def get_reconfirmation_prompt(session_id: str, skill_ids: str = Query(..., description="Comma-separated skill ids")) -> dict[str, Any]:
    """Return a prompt like 'I have the previous setup as ... Is that still correct?' for fields marked confirm_on_new_session."""
    svc = _get_sessions()
    ids = [s.strip() for s in skill_ids.split(",") if s.strip()]
    prompt = svc.get_reconfirmation_prompt(session_id, ids)
    return {"session_id": session_id, "skill_ids": ids, "reconfirmation_prompt": prompt}


@router.get("/{session_id}", response_model=dict[str, Any])
def get_session(session_id: str) -> dict[str, Any]:
    """Get session state (customer_context, inputs, last_confirmed_state, run_ids). Includes reconfirmation_prompt when prior state exists and confirm_on_new_session fields are set."""
    svc = _get_sessions()
    state = svc.get(session_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    out = state.model_dump(mode="json")
    if state.confirm_on_new_session_fields:
        prompt = svc.build_reconfirmation_prompt(session_id, state.confirm_on_new_session_fields)
        if prompt:
            out["reconfirmation_prompt"] = prompt
    return out


@router.post("/{session_id}/confirm-state", response_model=dict[str, Any])
def confirm_state(session_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """
    Confirm or update session state. Body: { "confirmed_state": dict, "inputs": dict? }.
    Updates last_confirmed_state and optionally inputs.
    """
    svc = _get_sessions()
    confirmed_state = body.get("confirmed_state") or body
    inputs = body.get("inputs")
    state = svc.update(
        session_id,
        last_confirmed_state=confirmed_state,
        inputs=inputs,
    )
    return {"session_id": session_id, "last_confirmed_state": state.last_confirmed_state, "updated": True}
