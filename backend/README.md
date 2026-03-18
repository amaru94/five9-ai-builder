# Five9 AI Skill Engine (Backend)

Production-ready backend for a modular Five9 AI skill engine: classify user problems into skills, collect inputs, confirm state, plan and execute REST, SOAP Admin Web Services, and Web2Campaign actions sequentially.

## Tech stack

- **Python 3.12**
- **FastAPI** (OpenAPI/Swagger at `/docs`)
- **Pydantic v2**
- **httpx** for REST and Web2Campaign
- SOAP via custom adapter (no zeep required for basic flow)
- Structured JSON logging
- One skill per JSON file under `app/skills/`; runtime registry built from that folder

## How to run locally

1. **Create virtualenv and install dependencies**

   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   # source .venv/bin/activate  # Linux/macOS
   pip install -r requirements.txt
   ```

2. **Optional: copy env example**

   ```bash
   copy .env.example .env   # Windows
   # cp .env.example .env   # Linux/macOS
   ```

3. **Run the app**

   From the `backend` directory:

   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   - API: http://localhost:8000  
   - Swagger: http://localhost:8000/docs  
   - ReDoc: http://localhost:8000/redoc  
   - Health: http://localhost:8000/health  

4. **Run tests**

   From the `backend` directory:

   ```bash
   pip install pytest
   python -m pytest tests/ -v
   ```

## Domain DNC bulk (`/dnc/bulk`)

- **Up to 10,000** unique US numbers per request (10-digit NANP; accepts formatting). Stored and sent to Five9 as **E.164** (`+1…`).
- **`add`**: Outside **11 PM–6 AM Pacific**, requests are **queued** (SQLite). The API responds with a **“queue for later / after-hours”** message and a `job_id`. A background worker runs queued adds during that window. Set `FIVE9_SOAP_USERNAME` / `FIVE9_SOAP_PASSWORD` and `EXECUTION_MODE=real` for live SOAP.
- **`remove`**: Calls `removeNumbersFromDnc` immediately (same auth; mocked if `EXECUTION_MODE=mocked`).
- **Job status**: `GET /dnc/jobs/{job_id}`.
- **Production**: set **`DNC_API_KEY`**; clients must send header **`X-DNC-API-Key`**. The Next.js app uses **`SKILL_ENGINE_DNC_KEY`** with the same value when proxying.

## File tree (main pieces)

```
backend/
  app/
    main.py                 # FastAPI app, lifespan, routers
    api/
      dnc.py                # POST /dnc/bulk, GET /dnc/jobs/{id}
      router.py             # POST /router/classify
      skills.py             # GET /skills, GET /skills/{id}, POST /skills/plan, POST /skills/execute
      workflows.py          # POST /workflows/plan, POST /workflows/execute
      sessions.py           # GET /sessions/{id}, POST /sessions/{id}/confirm-state
      runs.py               # GET /runs/{run_id}
    core/
      config.py             # Pydantic Settings (env)
      logging.py            # Structured JSON logging
      exceptions.py         # SkillEngineError, MissingInputError, etc.
    models/
      skill_definition.py    # SkillDefinition, AuthoringMetadata, InputSpec, ...
      api_action.py         # ApiAction, ActionTransport (REST/SOAP/WEB2CAMPAIGN/INTERNAL)
      skill_run.py          # SkillRun, RunStatus
      workflow_definition.py # WorkflowDefinition, WorkflowStep
      session_state.py     # SessionState
      router_result.py     # RouterResult
      execution_log.py     # ExecutionLog
    services/
      skill_loader.py       # Load .skill.json from disk
      skill_registry.py     # Runtime registry from skills dir
      llm_router.py         # Pluggable LLM classifier (mock by default)
      rule_router.py        # Rule-based fallback (trigger_phrases)
      routing_service.py    # Hybrid routing + confidence threshold
      input_collection_service.py
      session_state_service.py
      workflow_planner.py
      confirmation_service.py
      execution_service.py
      summary_service.py
    executors/
      rest_executor.py
      soap_executor.py
      web2campaign_executor.py
      internal_executor.py
    skills/                 # One JSON per skill
      *.skill.json
    registry/
      skills.registry.json  # Optional/generated
    prompts/
      routing_system.txt
    utils/
      template_renderer.py
      placeholder_resolver.py
      validators.py         # Web2Campaign F9TimeToCall/F9TimeFormat
      xml_helpers.py
  tests/
    test_registry.py
    test_placeholder_resolver.py
    test_routing_fallback.py
    test_missing_input.py
    test_confirmation_gating.py
    test_workflow_planning.py
    test_web2campaign_validation.py
    test_soap_model.py
  requirements.txt
  .env.example
```

## Example curl commands

**Classify (routing)**

```bash
curl -X POST http://localhost:8000/router/classify \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"Dialer is not reaching all my leads\"}"
```

**List skills**

```bash
curl http://localhost:8000/skills
```

**Get one skill**

```bash
curl http://localhost:8000/skills/dialer_optimization
```

**Plan skills (returns run_id and plan)**

```bash
curl -X POST http://localhost:8000/skills/plan \
  -H "Content-Type: application/json" \
  -d "{\"skill_ids\": [\"customer_discovery\", \"dialer_optimization\"], \"inputs\": {\"domain_id\": \"d1\", \"campaign_id\": \"c1\", \"campaign_profile_id\": \"p1\", \"agent_count\": 12, \"lead_demographic\": \"general\"}}"
```

**Execute (use run_id from plan)**

```bash
curl -X POST http://localhost:8000/skills/execute \
  -H "Content-Type: application/json" \
  -d "{\"run_id\": \"<run_id from plan>\", \"confirmed\": true}"
```

**Get run status**

```bash
curl http://localhost:8000/runs/<run_id>
```

**Session confirm state**

```bash
curl -X POST http://localhost:8000/sessions/my-session-id/confirm-state \
  -H "Content-Type: application/json" \
  -d "{\"confirmed_state\": {\"dialing_mode\": \"Power\", \"agent_count\": 12, \"web2campaign_enabled\": true}}"
```

## Example skill execution payloads

**Plan (minimal for dialer_optimization)**

```json
{
  "skill_ids": ["dialer_optimization"],
  "session_id": "sess-1",
  "inputs": {
    "domain_id": "dom-123",
    "campaign_id": "camp-456",
    "campaign_profile_id": "prof-789",
    "agent_count": 20,
    "lead_demographic": "elderly"
  }
}
```

**Execute**

```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "sess-1",
  "confirmed": true
}
```

**Web2Campaign AddToList (plan + execute with web2campaign_ingest)**

```json
{
  "skill_ids": ["web2campaign_ingest"],
  "inputs": {
    "F9domain": "my-domain",
    "F9list": "My List",
    "number1": "+15551234567"
  }
}
```

If you send `F9TimeToCall`, you must also send `F9TimeFormat` (validated by the backend).

## Execution mode

- **mocked** (default): No outbound HTTP to Five9; executors return success and log request metadata.
- **real**: Set `EXECUTION_MODE=real` in `.env` to call Five9 REST/SOAP/Web2Campaign (requires valid endpoints and credentials where applicable).

---

## Detailed examples

### 1. Dialer optimization (plan + execute, optional dry_run)

**Step 1 – Plan**

Request:

```bash
curl -X POST http://localhost:8000/skills/plan \
  -H "Content-Type: application/json" \
  -d '{
    "skill_ids": ["dialer_optimization"],
    "session_id": "sess-dialer-1",
    "inputs": {
      "domain_id": "dom-abc",
      "campaign_id": "camp-xyz",
      "campaign_profile_id": "prof-001",
      "agent_count": 25,
      "lead_demographic": "elderly",
      "web2campaign_enabled": true
    }
  }'
```

Sample response:

```json
{
  "run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "session_id": "sess-dialer-1",
  "plan": [
    {
      "skill_id": "dialer_optimization",
      "actions": ["get_dialer_config", "set_timeout_60", "update_dial_schedule", "update_asap_if_needed"],
      "overrides": {}
    }
  ],
  "inputs_snapshot": { ... },
  "missing_inputs": [],
  "confirmation_required": true
}
```

**Step 2 – Execute (or dry_run to see rendered requests only)**

Execute for real (or mocked, depending on `EXECUTION_MODE`):

```bash
curl -X POST http://localhost:8000/skills/execute \
  -H "Content-Type: application/json" \
  -d '{"run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "confirmed": true}'
```

Dry run (no external APIs; returns rendered payloads only):

```bash
curl -X POST http://localhost:8000/skills/execute \
  -H "Content-Type: application/json" \
  -d '{"run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "confirmed": true, "dry_run": true}'
```

Sample dry_run response:

```json
{
  "run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "error_message": null,
  "execution_log_ids": [],
  "rendered_request_payloads": [
    {
      "transport": "REST",
      "action_id": "get_dialer_config",
      "skill_id": "dialer_optimization",
      "method": "GET",
      "url": "https://api.five9.com/dialer/v1/domains/dom-abc/campaigns/camp-xyz/configuration",
      "headers": null,
      "body": null
    },
    {
      "transport": "REST",
      "action_id": "set_timeout_60",
      "skill_id": "dialer_optimization",
      "method": "PATCH",
      "url": "https://api.five9.com/dialer/v1/domains/dom-abc/campaigns/camp-xyz/configuration",
      "body": { "ringTimeoutSeconds": 60 }
    }
  ]
}
```

---

### 2. Web2Campaign ingest (AddToList)

**Plan**

```bash
curl -X POST http://localhost:8000/skills/plan \
  -H "Content-Type: application/json" \
  -d '{
    "skill_ids": ["web2campaign_ingest"],
    "inputs": {
      "F9domain": "my-five9-domain",
      "F9list": "Inbound Leads",
      "number1": "+15551234567",
      "F9CallASAP": "1"
    }
  }'
```

**Execute with dry_run** (to inspect the form payload that would be sent):

```bash
curl -X POST http://localhost:8000/skills/execute \
  -H "Content-Type: application/json" \
  -d '{"run_id": "<run_id from plan>", "confirmed": true, "dry_run": true}'
```

Example `rendered_request_payloads` entry for Web2Campaign:

```json
{
  "transport": "WEB2CAMPAIGN",
  "action_id": "add_to_list",
  "skill_id": "web2campaign_ingest",
  "method": "POST",
  "url": "https://api.five9.com/web2campaign/AddToList",
  "params": {
    "F9domain": "my-five9-domain",
    "F9list": "Inbound Leads",
    "number1": "+15551234567",
    "F9CallASAP": "1"
  }
}
```

If you use scheduled call time, send both `F9TimeToCall` and `F9TimeFormat` (validation will fail otherwise):

```json
"inputs": {
  "F9domain": "my-domain",
  "F9list": "My List",
  "number1": "+15551234567",
  "F9TimeToCall": "14:00",
  "F9TimeFormat": "HH:mm"
}
```

---

### 3. SOAP createSkill (Admin Web Services)

**Plan** using the `admin_ws_skill_management` skill with operation and skill name:

```bash
curl -X POST http://localhost:8000/skills/plan \
  -H "Content-Type: application/json" \
  -d '{
    "skill_ids": ["admin_ws_skill_management"],
    "inputs": {
      "operation": "createSkill",
      "skill_name": "My New Skill"
    }
  }'
```

(Your skill JSON may map this to the `create_skill` action; ensure inputs include any keys used in the SOAP body template, e.g. `skill_name`.)

**Execute with dry_run** to see the SOAP envelope that would be sent:

```bash
curl -X POST http://localhost:8000/skills/execute \
  -H "Content-Type: application/json" \
  -d '{"run_id": "<run_id from plan>", "confirmed": true, "dry_run": true}'
```

Example rendered SOAP payload:

```json
{
  "transport": "SOAP",
  "action_id": "create_skill",
  "skill_id": "admin_ws_skill_management",
  "method": "POST",
  "url": "https://api.five9.com/wsadmin/v11_5/AdminWebService",
  "body": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>..."
}
```

The `body` contains the full SOAP envelope with placeholders resolved (e.g. `{{skill_name}}` → `My New Skill`).

---

## Extending with new Five9 scenarios

- **New skill**: Add a new `app/skills/<id>.skill.json` with `id`, `name`, `authoring`, `routing`, `required_inputs`, `optional_inputs`, `actions`, `outputs`, `execution_settings`. Restart the app; the registry builder will load it and write `app/registry/skills.registry.json`.
- **New REST endpoint**: In the skill JSON, add an action with `transport: "REST"`, `method`, `path` (e.g. `lists/v1/domains/{{domain_id}}/...`), and optional `body`. No Python code change if the endpoint fits existing REST executor behavior.
- **New SOAP operation**: Add an action with `transport: "SOAP"`, `soap_operation`, and `soap_body_template` (dict with `body` and optional `namespace`). Resolve placeholders in the body via `{{key}}`.
- **Pluggable LLM**: Implement `LLMRouterProtocol` (e.g. `async def classify(message, context) -> RouterResult`) and pass your router into `RoutingService(llm_router=...)` or set `LLM_ROUTER_URL` and wire a remote client in `get_llm_router()`.

## Key implementation notes

- **JSON Schema**: All Pydantic models export clean JSON Schema via `GET /schemas` and `GET /schemas/{model_name}` (e.g. `SkillDefinition`, `ApiAction`, `RouterResult`).
- **Registry**: At startup the app scans `app/skills/*.skill.json` and writes `app/registry/skills.registry.json`.
- **Routing**: Pluggable LLM router (`LLMRouterProtocol`) + mock provider (`MockLLMRouter`); rule-based fallback; low confidence returns clarification questions.
- **dry_run**: On `POST /skills/execute` and `POST /workflows/execute`, set `"dry_run": true` to get `rendered_request_payloads` only (no external API calls).
- **Confirmation**: Risk-aware step-level confirmation when `ApiAction.risk_level` is high or `requires_confirmation` is true (with `adaptive_step_confirmation` on).
- **Execution**: Sequential only; workflow-level confirmation by default.
- **Placeholders**: All action templates use `{{key}}`; resolved from merged session + request inputs before execution.
- **Web2Campaign**: F9TimeToCall requires F9TimeFormat (validated in `validators.validate_web2campaign_params`).
- **SOAP**: Generic operation + body template; URL can include `{{ws_version}}`; more operations addable via skill JSON.
- **Sessions**: Stored in-memory; reconfirmation helpers: `GET /sessions/{id}/reconfirmation-fields?skill_ids=...`, `GET /sessions/{id}/reconfirmation-prompt?skill_ids=...` for fields marked `confirm_on_new_session`.
- **Campaign script builder**: INTERNAL handler `generate_script` returns HTML with Five9 variable syntax `@entity.fieldname@` only; field names come from payload, never invented.
