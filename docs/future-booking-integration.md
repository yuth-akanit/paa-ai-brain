# Future Booking Integration

## Why Booking Is Deferred
This MVP intentionally stops at qualification and handoff. HVAC booking often depends on technician availability, geography, urgency, and job complexity. Those constraints should come from operational systems, not the LLM.

## Recommended Phase 2 Booking Architecture
- Add a `booking_requests` table linked to `service_cases`.
- Expose dedicated booking endpoints or Supabase RPCs for slot search and booking confirmation.
- Keep booking policies in configuration tables, not in prompts.
- Use n8n to notify admins or dispatch teams after booking confirmation.

## Safe Booking Flow
1. Case reaches `qualified`.
2. Admin or future scheduler service requests slot availability from the booking module.
3. The module validates area, service type, required technician skills, and business hours.
4. Only returned slots may be shown to the customer.
5. Booking confirmation writes audit logs and timeline events.

## Integration Notes
- Do not put booking availability into static prompts.
- Use separate idempotent endpoints for `search-slots`, `hold-slot`, and `confirm-booking`.
- Preserve the current `service_cases` and `conversation_threads` tables as the intake layer.
