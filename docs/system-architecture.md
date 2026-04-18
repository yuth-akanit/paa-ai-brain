# System Architecture

## Overview
PAA AI Customer Service System is a Thai-first service-intake and lead qualification platform designed around LINE OA as the primary channel. The MVP centers on durable conversation storage, structured case extraction, AI-assisted follow-up, and clean admin handoff.

## Core Principles
- Supabase is the source of truth for customers, threads, messages, cases, pricing, and knowledge.
- AI is constrained to extraction and response formatting. It does not own pricing, policy, or workflow state.
- Business rules live in typed server-side modules under `lib/cases` and `lib/db`.
- LINE integration is an adapter layer. Additional channels can reuse the same case pipeline later.

## Request Flow
1. LINE sends webhook events to `POST /api/webhooks/line`.
2. Signature is verified in `lib/line/verify-signature.ts`.
3. The system resolves the customer and channel, then loads or creates the active conversation thread and service case.
4. `lib/cases/case-manager.ts` stores the inbound message, classifies intent, extracts structured fields, looks up knowledge/pricing, generates a validated AI decision, updates case state, and optionally creates an admin handoff.
5. The assistant reply is sent back to LINE through `lib/line/client.ts`.
6. Admin users review cases in `/admin/cases` and manage knowledge in `/admin/knowledge`.

## AI Safety Design
- Pricing, service area guidance, and inspection fee policy are read from `pricing_rules` and `knowledge_docs`.
- LLM output is validated with Zod before use.
- If the model response is invalid or unavailable, the system falls back to deterministic heuristics.
- The system asks one focused follow-up question at a time and progressively fills `extracted_fields`.

## Data Model
- `customers`: root customer profile
- `customer_channels`: per-channel identity map
- `conversation_threads`: stateful conversation container per customer/channel
- `conversation_messages`: durable message history
- `service_cases`: lead qualification state and extracted field store
- `knowledge_docs`: FAQ and policy source material
- `service_catalog`: service taxonomy
- `pricing_rules`: controlled price/policy facts
- `admin_handoffs`: summarized escalations for human takeover
- `audit_logs`: trace of critical business events

## Future Integration Points
- n8n can subscribe to `service_cases` and `admin_handoffs` for downstream notifications, CRM sync, and task routing.
- Booking logic should be isolated behind dedicated modules or RPC endpoints later, without changing the intake pipeline.
- Multi-channel support can add new webhook adapters while reusing `processCustomerMessage`.
