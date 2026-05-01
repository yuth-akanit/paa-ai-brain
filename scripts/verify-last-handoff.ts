
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createServiceClient } from "../lib/db/supabase";

/**
 * Reusable utility to verify the latest handoff record in the system.
 * Usage: npx tsx scripts/verify-last-handoff.ts [external_user_id]
 */

async function verifyLastHandoff() {
  const supabase = createServiceClient();
  const targetExternalId = process.argv[2];

  console.log("🔍 Starting Handoff Verification...");

  let customerId: string | null = null;

  if (targetExternalId) {
    console.log(`Checking specifically for LINE User ID: ${targetExternalId}`);
    const { data: channel } = await supabase
      .from("customer_channels")
      .select("customer_id")
      .eq("external_user_id", targetExternalId)
      .maybeSingle();
    
    if (!channel) {
      console.error("❌ Channel not found for this ID.");
      return;
    }
    customerId = channel.customer_id;
  }

  // Fetch the latest handoff
  let query = supabase
    .from("admin_handoffs")
    .select(`
      id,
      status,
      handoff_reason,
      summary_payload,
      created_at,
      service_cases (
        id,
        lead_status,
        service_type,
        extracted_fields,
        summary,
        customers ( display_name )
      )
    `)
    .order("created_at", { ascending: false })
    .limit(1);

  if (customerId) {
    // Note: admin_handoffs doesn't have customer_id directly, we filter via the related case
    // But for a simple script, we'll just check all if No ID, or find the case first.
    // Let's just find the latest case for that customer and its handoff.
    const { data: latestCase } = await supabase
        .from("service_cases")
        .select("id")
        .eq("customer_id", customerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    
    if (latestCase) {
        query = query.eq("case_id", latestCase.id);
    }
  }

  const { data: handoffs, error } = await query;

  if (error || !handoffs || handoffs.length === 0) {
    console.log("❓ No handoff records found.");
    return;
  }

  const h = handoffs[0];
  const c = h.service_cases as any;

  console.log("\n==========================================");
  console.log(`✅ LATEST HANDOFF FOUND: ${h.id}`);
  console.log("==========================================");
  console.log(`Status:      ${h.status}`);
  console.log(`Reason:      ${h.handoff_reason}`);
  console.log(`Timestamp:   ${h.created_at}`);
  console.log("------------------------------------------");
  console.log(`Customer:    ${c?.customers?.display_name || "Unknown"}`);
  console.log(`Lead Status: ${c?.lead_status}`);
  console.log(`Service:     ${c?.service_type}`);
  console.log(`Summary:     ${c?.summary}`);
  console.log("------------------------------------------");
  console.log("Extracted Fields:");
  console.dir(c?.extracted_fields || {}, { depth: null });
  console.log("------------------------------------------");
  console.log("Payload Snapshot:");
  console.dir(h.summary_payload || {}, { depth: null });
  console.log("==========================================\n");

  // Parity Check
  const nameMatch = c?.customers?.display_name?.includes(h.summary_payload.customerName) || h.summary_payload.customerName === c?.extracted_fields?.customer_name;
  console.log(`Data Parity Check: ${nameMatch ? "PASS ✅" : "WARNING ⚠️ (Name Mismatch)"}`);
}

verifyLastHandoff().catch(err => {
    console.error("Critical verification error:", err);
    process.exit(1);
});
