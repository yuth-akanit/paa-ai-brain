# Local Testing Policy

## Lock Policy
- No write to Supabase
- No delete on Supabase
- No schema change on Supabase
- Test through local mock mode and dry-run mode only

## Known Test Contamination
Do not modify or delete these rows for now:
- `customers.id = 00000000-0000-0000-0000-000000000301`
- `customer_channels.id = 00000000-0000-0000-0000-000000000401`

These are treated as known contamination records from earlier debugging and should remain untouched until a coordinated cleanup plan exists.

## Mock Mode
Set:

```env
APP_MOCK_MODE=true
APP_DRY_RUN_MODE=true
```

When enabled:
- `/admin/cases`
- `/admin/cases/[id]`
- `/admin/knowledge`

read from local fixtures instead of Supabase.

## Scenario Fixtures
Dry-run scenarios live in `fixtures/scenarios/` and each file contains:
- `name`
- `input`
- `expected`

Recommended core scenarios currently covered:
- `faq_price_basic`
- `faq_service_area_basic`
- `inspection_request_basic`
- `relocation_request_basic`
- `repair_request_basic`
- `cold_room_request_handoff`
- `low_confidence_custom_question`
- `admin_direct_handoff_basic`

## Safety Notes
- `scripts/seed-sample-cases.sh` is intentionally blocked because it writes to Supabase.
- `scripts/test-line-webhook.sh` is intentionally blocked because it targets the live webhook flow.
- Use only `scripts/dry-run-simulate.sh` or `/api/dev/simulate/*` for local verification.

## Dry-Run Endpoints
- `POST /api/dev/simulate/line`
- `POST /api/dev/simulate/respond`
- `POST /api/dev/simulate/handoff`

These routes never write to the database. They simulate intake, extraction, qualification, response generation, and handoff summary creation using local fixtures and fallback AI logic.
They also skip remote LLM calls entirely, so dry-run stays local-only even if `OPENAI_API_KEY` exists in `.env.local`.

## Local Commands
Run the Next.js app with mock mode enabled, then call:

```bash
npm run dry-run:respond
npm run dry-run:line
npm run dry-run:handoff
npm run dry-run:regression
```
