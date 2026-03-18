# Voice / call domain DNC recovery

## What the code calls (and does not call)

| SOAP method | Purpose |
|-------------|---------|
| **checkDncForNumbers** | Read-only: which numbers are on the **domain** DNC list (voice). |
| **removeNumbersFromDnc** | Removes number from **domain** DNC only (this app’s recovery path). |

**Not used in this flow:** `deleteRecordFromList`, `deleteFromList`, `deleteContact`, or any other list/contact delete.

**Endpoint:** `{dataCenter base}/wsadmin/v11_5/AdminWebService` (falls back to v9_5, v2).

## Old vs new behavior

- **Previously:** Chat could hit `/api/five9/dnc` with `removeNumbersFromDnc` only, or bulk `/dnc/bulk` — still only those SOAP ops; no extra deletes in code. Side effects on contacts/lists come from **Five9**, not from additional SOAP calls in this repo.
- **Now:** **Voice recovery** runs **check → remove only if on DNC → check**, with full step logs. Same safe SOAP set; smarter gating and visibility.

## APIs

- **Next (Connected):** `POST /api/five9/dnc-voice-recovery`  
  Body: `{ dataCenter, encodedAuth, numbers: string[], forceRemoveEvenIfNotOnDnc?: boolean }`

- **Python skill engine:** `POST /dnc/voice-recovery`  
  Body: `{ numbers, encoded_auth?, force_remove_even_if_not_on_dnc? }`  
  (Respects `DNC_API_KEY` if set.)

## Example server log (Next)

```
[voice-dnc-recovery] start numbers=+18162002900 auth=Basic *** (credentials masked) base=https://api.five9.com
[voice-dnc-recovery] summary {"numbers":["+18162002900"],"onDomainDncBefore":{"+18162002900":true},...}
```

## If still not dialable

Do not assume DNC. Surface: disposition, finalized contact state, or list/campaign rules — not SMS opt-in.
