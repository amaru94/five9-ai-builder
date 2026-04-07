/**
 * Injected into GET /api/playbook when the "Domain DNC" admin module is empty,
 * so the assistant always knows domain DNC is supported in-app.
 */
export const DOMAIN_DNC_PLAYBOOK_DEFAULT = `**Domain DNC is supported in this application.** Do not tell the user that DNC cannot be managed here.

- **Chat — block:** *add … to dnc* / *block … on dnc* (Connected).
- **Chat — voice DNC recovery (unblock calls):** *remove … from dnc* runs **checkDncForNumbers → removeNumbersFromDnc (only if on DNC) → check again**; see docs/DNC_VOICE_RECOVERY.md. No list/contact delete APIs are called.
- **Admin → Domain DNC bulk** is still available for pasting **large lists** (up to **10,000** numbers) without typing in chat.
- **Remove** runs immediately when the backend has Five9 SOAP + real mode.
- **Add** outside **11 PM–6 AM Pacific** is **queued** (after-hours message).
- If chat did not pick up their numbers (no digits in message), ask for 10-digit numbers or point to Admin bulk.
- **Five9 Admin UI** alternative: Admin → Lists → DNC.`;
