# Five9 skill clone & user migration (CSV)

This app feature lives at **Admin → Skill clone & user migration** (`/app/admin/skills-migration`). It uses the same **Connect-style** Five9 credentials (Basic auth) as other direct SOAP tools.

## Owned CSV columns

| Column | Required | Description |
|--------|----------|-------------|
| `source_skill_name` | Yes | Existing skill to copy from (template). Aliases: `existing_skill`, `source_skill`, `from_skill`. |
| `target_skill_name` | Yes | New skill name to create / migrate users to. Aliases: `new_skill`, `target_skill`. |
| `clone` | No (default **Y**) | **Y**: call `getSkillInfo` + `createSkill` (copy config). **N**: skip create (target must already exist). |
| `migrate_users` | No (default **N**) | **Y**: move users from source skill to target (`userSkillRemove` + `userSkillAdd`). |
| `user_login` | If migrating | Agent **Five9 user name** to migrate. Use **\*** (or `all`) to auto-discover users who have `source_skill_name` (scan capped ~120 matches, many `getUserInfo` calls). |

Example:

```csv
source_skill_name,target_skill_name,clone,migrate_users,user_login
IB_ENG_FL_BASE,IB_ENG_FL_TV,Y,N,
IB_ENG_FL_BASE,IB_ENG_FL_CABLE,Y,N,
IB_ENG_FL_OLD,IB_ENG_FL_TV,N,Y,agent1@domain.com
```

## Flow

1. **Dry run** — preview steps; no writes.
2. Review the step table.
3. Uncheck dry run; for large `*` migrations, check **Confirm bulk user migration** after dry run.

## API

`POST /api/five9/skills/migrate`

```json
{
  "dataCenter": "US",
  "encodedAuth": "<base64 user:pass>",
  "csvText": "...",
  "dryRun": true,
  "confirmBulkMigrate": false
}
```

## Limitations

- **Full skill clone** depends on Five9 accepting the full `skillInfo` from `getSkillInfo` on `createSkill`. If the tenant rejects it, the tool falls back to **name + description** only.
- **User discovery** with `*` is slow and capped; prefer explicit `user_login` per row for large domains.
- **userSkill** level is preserved when moving from source to target.

Server logs JSON lines: `skillMigration`, `skillMigrationSummary`, `skillMigrationCsvWarnings`.
