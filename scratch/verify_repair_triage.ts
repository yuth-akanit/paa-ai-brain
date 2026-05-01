import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { processCustomerMessage } from "../lib/cases/case-manager";
import { 
  findOrCreateCustomerByChannel,
  getOrCreateOpenThread,
  getOrCreateServiceCase,
  updateCaseState
} from "../lib/db/queries";
import { ExtractedCaseFields } from "../lib/types";

async function verifyHardenedRepairFSM() {
  console.log("--- START HARDENED REPAIR FSM VERIFICATION ---");

  // 1. Setup Mock Data
  const customer = await findOrCreateCustomerByChannel({ 
    provider: "line", 
    externalUserId: "test-fsm-" + Date.now(),
    displayName: "tonhom2517"
  });
  const thread = await getOrCreateOpenThread(customer.id, "line");
  const serviceCase = await getOrCreateServiceCase(thread.id, customer.id);

  // Inject "Dirty" State (Stale data including scheduling)
  const dirtyFields: ExtractedCaseFields = {
    customer_name: "tonhom2517",
    preferred_date: "วันเสาร์",
    preferred_time: "ช่วงเย็น",
    area: "สุขุมวิท 101",
    building_type: "คอนโด",
    service_type: "cleaning"
  };
  await updateCaseState({ caseId: serviceCase.id, extractedFields: dirtyFields });
  console.log("[SETUP] Dirty state applied:", dirtyFields);

  // --- TURN 1: Fresh Repair Start (Hallucination Guard Test) ---
  console.log("\n--- TURN 1: Fresh Repair Start ---");
  const t1 = await processCustomerMessage({
    threadId: thread.id,
    caseId: serviceCase.id,
    customerId: customer.id,
    customerName: null,
    messageText: "สวัสดีครับ จะให้มาซ่อมแอร์หน่อยครับ อาการคือเปิดแล้วไม่มีความเย็นครับ",
    metadata: {}
  });

  console.log("[RESULT T1] Intent:", t1.intent);
  console.log("[RESULT T1] Merged Fields:", {
    date: t1.mergedFields.preferred_date,
    area: t1.mergedFields.area,
    building: t1.mergedFields.building_type
  });
  console.log("[RESULT T1] Reply:", t1.customerReply);

  if (!t1.mergedFields.preferred_date && !t1.mergedFields.area) console.log("✅ PASS: Stale scheduling/location cleared (Hallucination Guard).");
  else console.error("❌ FAIL: Stale data leaked on Turn 1!");

  if (t1.customerReply.includes("ล้างแอร์ล่าสุด")) console.log("✅ PASS: Correct sequence (Asked History on Turn 1).");
  else console.error("❌ FAIL: Triage override FAILED on Turn 1!");

  // --- TURN 2: Building Type (FSM Loop Test) ---
  console.log("\n--- TURN 2: Site Details ---");
  const t2 = await processCustomerMessage({
    threadId: thread.id,
    caseId: serviceCase.id,
    customerId: customer.id,
    customerName: null,
    messageText: "เป็นคอนโดครับ",
    metadata: t1.nextMetadata
  });

  console.log("[RESULT T2] Captured Building:", t2.mergedFields.building_type);
  console.log("[RESULT T2] Reply:", t2.customerReply);
  // After symptoms and building, next should be History (if missing) or Parking.
  // In my sequence: symptoms -> history -> building -> parking.
  // Turn 1 symptoms provided -> asked History.
  // Turn 2 building provided -> still missing History? YES.
  if (t2.customerReply.includes("ล้างแอร์ล่าสุด")) console.log("✅ PASS: Persistent triage (Still asking for history).");
  else console.error("❌ FAIL: Triage loop broken!");

  // --- TURN 3: Confirmation Sanitization Test ---
  console.log("\n--- TURN 3: Premature Confirmation Guard ---");
  const fullFields: ExtractedCaseFields = {
    ...t2.mergedFields,
    last_cleaning_recency: "เดือนที่แล้ว",
    parking_context: "มี",
    walking_distance: "ใกล้",
    machine_type: "wall",
    machine_count: 1,
    area: "บางพลี",
    phone: "0812345678",
    customer_name: "สมชาย",
    preferred_date: "เสาร์นี้",
    preferred_time: "เช้า"
  };
  await updateCaseState({ caseId: serviceCase.id, extractedFields: fullFields });

  const t3 = await processCustomerMessage({
    threadId: thread.id,
    caseId: serviceCase.id,
    customerId: customer.id,
    customerName: null,
    messageText: "ยืนยันตามนี้ครับ",
    metadata: { ...t2.nextMetadata, active_flow: "repair" }
  });

  console.log("[RESULT T3] Final Reply:", t3.customerReply);
  if (t3.customerReply.includes("แอดมินเช็กคิว") || t3.customerReply.includes("ยืนยันกลับ")) console.log("✅ PASS: Confirmation sanitized.");
  else console.error("❌ FAIL: Premature confirmation leaked!");

  // --- TURN 4: Farewell Guard ---
  console.log("\n--- TURN 4: Farewell Guard ---");
  const t4 = await processCustomerMessage({
    threadId: thread.id,
    caseId: serviceCase.id,
    customerId: customer.id,
    customerName: null,
    messageText: "ขอบคุณครับ",
    metadata: t3.nextMetadata
  });

  console.log("[RESULT T4] Intent:", t4.intent);
  console.log("[RESULT T4] Reply:", t4.customerReply);
  if (!t4.customerReply.includes("หน้างาน") && !t4.customerReply.includes("จอดรถ")) console.log("✅ PASS: Farewell respected.");
  else console.error("❌ FAIL: Triage re-opened after farewell!");

  console.log("\n--- VERIFICATION COMPLETE ---");
}

verifyHardenedRepairFSM().catch(console.error);
