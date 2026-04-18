# PAA AI Customer Service System

Production-oriented MVP for PAA Air Service to handle Thai-first customer service intake, FAQ answering, structured lead qualification, and admin handoff, starting with LINE OA and designed to extend to Facebook Messenger, website chat, and Instagram later.

## 🚦 Local AI Quality Gateway
This project is equipped with an **AI Governance & Quality Control Lab**. Before integrating with live LINE production, use the built-in [**Local AI Quality Gateway**](./docs/final-handoff-local-quality-gateway.md) to validate all AI behaviors and prompts.

## Features
- LINE OA webhook intake with signature verification
- Durable customer, thread, message, and service-case storage in Supabase
- Intent classification and structured field extraction
- Safe AI response generation with Zod-validated JSON
- Progressive missing-field collection
- Admin handoff creation with summarized payload
- Next.js admin dashboard for case queue and knowledge management
- Seeded Thai FAQ, pricing, and policy content

## Stack
- Next.js App Router
- Next.js Route Handlers
- TypeScript
- Supabase Postgres
- n8n-ready modular backend

## Project Structure
```text
app/
components/
docs/
lib/
  ai/
  cases/
  db/
  knowledge/
  line/
supabase/
  migrations/
```

## Environment Setup
Copy `.env.example` to `.env.local` and fill in:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_ADMIN_NOTIFY_TARGETS`
- `LINE_ADMIN_BOOKING_WEBHOOK_URL`
- `ADMIN_BASIC_AUTH_USER`
- `ADMIN_BASIC_AUTH_PASS`
- `AI_GATEWAY_INTERNAL_KEY`

## Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run Supabase migrations against your project or local stack:
   ```bash
   supabase db push
   ```
3. Start the app:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000/admin/cases`

## LINE Webhook Setup
Set the webhook URL in LINE Developers Console to:

```text
https://your-domain.com/api/webhooks/line
```

The route verifies `x-line-signature` using `LINE_CHANNEL_SECRET`.

## Deployment Notes
- Deploy on Vercel or a Node-compatible platform.
- Store secrets in deployment environment variables.
- Protect `/admin` and `/api/admin/*` using the included Basic Auth middleware or replace it with SSO later.
- Use Supabase service role only on the server.
- Point n8n to API routes or Supabase triggers for downstream workflow automation.

### VPS Docker Deploy
If you deploy to a Linux VPS with Docker Compose, keep `.env.local` on the server and use the included deploy helper from your local machine:

```bash
DEPLOY_HOST=your-vps-ip ./deploy.sh
```

Optional variables:

- `DEPLOY_USER` default: `root`
- `DEPLOY_PORT` default: `22`
- `DEPLOY_PATH` default: `/root/paa-ai-brain`
- `DEPLOY_SERVICE` default: `ai-brain`
- `DEPLOY_RELEASE` default: current timestamp เช่น `20260416-153000`
- `DEPLOY_BRANCH` default: current git branch, หรือ `local` ถ้าไม่มี git metadata
- `DEPLOY_ARCHIVE_DIR` default: `.deploy/releases`
- `DEPLOY_SSH_OPTS` for extra SSH flags such as `-i ~/.ssh/your-key`
- `AUTO_RELEASE_CRON_ENABLED` default: `true`
- `AUTO_RELEASE_CRON_SCHEDULE` default: `*/5 * * * *`
- `AUTO_RELEASE_CRON_LOG` default: `/var/log/paa-auto-release.log`

Example:

```bash
DEPLOY_HOST=203.0.113.10 \
DEPLOY_USER=root \
DEPLOY_PATH=/root/paa-ai-brain \
DEPLOY_RELEASE=prod-20260416-1 \
DEPLOY_BRANCH=main \
DEPLOY_SSH_OPTS="-i ~/.ssh/id_rsa" \
./deploy.sh
```

ทุกครั้งที่รัน `deploy.sh` ระบบจะ:

- สร้าง release archive ไว้ใน `.deploy/releases`
- อัปโหลด archive ไปที่ `releases/` บน VPS
- เขียน metadata ของ release ล่าสุดไว้ที่ `release.json` บน VPS
- rebuild container และติดตั้ง cron job สำหรับเรียก `/api/admin/auto-release-stale` อัตโนมัติทุก 5 นาที

## Operational Rules
- AI must not invent prices, booking slots, or policy details.
- All commercial facts should be managed through `pricing_rules` and `knowledge_docs`.
- Complex or low-confidence cases should be escalated via `admin_handoffs`.

## Suggested n8n Follow-up
- When `admin_handoffs.status = pending`, notify the admin LINE group or Slack
- When `service_cases.lead_status = qualified`, create a sales follow-up task
- When a customer profile is updated, sync to CRM

## Current Limitations
- Customer profile enrichment from LINE profile API is not yet implemented.
- Admin UI is server-rendered and intentionally simple for MVP stability.
- Booking is intentionally deferred to a separate module.
