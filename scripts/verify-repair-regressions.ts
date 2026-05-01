import { extractStructuredFields } from "@/lib/ai/structured-extractor";
import {
  applyRepairDirectAnswerCapture,
  buildBookingConfirmationReply
} from "@/lib/cases/case-manager";
import { normalizeScheduleFields } from "@/lib/cases/schedule-normalizer";
import type { ExtractedCaseFields } from "@/lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const parkingStepState = applyRepairDirectAnswerCapture({
    activeFlow: "repair",
    lastPromptType: "repair_parking_step",
    messageText: "จอดหน้าบ้าน",
    mergedFields: { building_type: "คอนโด" },
    extractedFields: {}
  });

  assert(parkingStepState.mergedFields.building_type === "คอนโด", "front-door parking must not overwrite building_type");
  assert(parkingStepState.mergedFields.parking_context === "จอดหน้าบ้าน", "front-door parking should populate parking_context at parking step");
  assert(parkingStepState.mergedFields.walking_distance === "หน้างาน", "front-door parking should skip walking distance at parking step");

  const walkingStepState = applyRepairDirectAnswerCapture({
    activeFlow: "repair",
    lastPromptType: "repair_parking_distance_step",
    messageText: "จอดหน้าบ้าน",
    mergedFields: { building_type: "คอนโด", parking_context: "มีที่จอดรถ" },
    extractedFields: {}
  });

  assert(walkingStepState.mergedFields.building_type === "คอนโด", "walking-distance step must preserve building_type");
  assert(walkingStepState.mergedFields.parking_context === "จอดหน้าบ้าน", "front-door parking should normalize parking_context at walking step");
  assert(walkingStepState.mergedFields.walking_distance === "หน้างาน", "front-door parking should skip walking distance at walking step");

  const compactAddress = await extractStructuredFields("14/255 บางพลี สมุทรปราการ");
  assert(compactAddress.address === "14/255 บางพลี สมุทรปราการ", "compact address should preserve full address");
  assert(compactAddress.area === "บางพลี", "compact address should derive short area label");

  const multilineContact = await extractStructuredFields("0850252102\nต้อม");
  assert(multilineContact.phone === "0850252102", "multiline contact should capture phone");
  assert(!multilineContact.customer_name, "plain multiline contact should not capture name without prompt or label");

  const labeledContact = await extractStructuredFields("👤 ชื่อ: คุณต้อม\n📞 เบอร์: 0850252102");
  assert(labeledContact.customer_name === "ต้อม", "labeled contact should capture name");
  assert(labeledContact.phone === "0850252102", "labeled contact should capture phone");

  const historyOnly = await extractStructuredFields("เดือนที่แล้ว");
  assert(!historyOnly.customer_name, "history-like text must never become customer_name");

  const multilineSchedule = normalizeScheduleFields({}, "เสาร์\n14.00", new Date("2026-04-24T16:20:46Z"));
  assert(multilineSchedule.preferred_date_iso === "2026-04-25", "multiline schedule should resolve next Saturday in Bangkok");
  assert(multilineSchedule.preferred_time_exact === "14:00", "multiline schedule should normalize exact time");

  const labeledScheduleExtracted = await extractStructuredFields("🗓 วันนัด: เสาร์ 26 เม.ย. 2569\n⏰ เวลา: 14:00");
  assert(labeledScheduleExtracted.preferred_date === "เสาร์ 26 เม.ย. 2569", "labeled schedule should preserve full date text");
  assert(!labeledScheduleExtracted.address, "labeled schedule must not populate address");

  const labeledSchedule = normalizeScheduleFields(
    labeledScheduleExtracted,
    "🗓 วันนัด: เสาร์ 26 เม.ย. 2569\n⏰ เวลา: 14:00",
    new Date("2026-04-24T16:20:46Z")
  );
  assert(labeledSchedule.preferred_date_iso === "2026-04-26", "absolute Thai date should win over weekday text");
  assert(labeledSchedule.preferred_time_exact === "14:00", "labeled schedule should normalize exact time");

  const summary = buildBookingConfirmationReply({
    customer_name: "ต้อม",
    phone: "0850252102",
    address: "14/255 บางพลี สมุทรปราการ",
    area: "บางพลี",
    preferred_date: "🗓 วันนัด: เสาร์ 26 เม.ย. 2569",
    preferred_date_iso: "2026-04-26",
    preferred_time_exact: "14:00",
    service_type: "repair",
    machine_count: 2,
    building_type: "คอนโด",
    parking_context: "จอดหน้าบ้าน",
    walking_distance: "หน้างาน"
  } satisfies ExtractedCaseFields);

  assert(summary.includes("📍 ที่อยู่: 14/255 บางพลี สมุทรปราการ"), "summary should include full address");
  assert(summary.includes("📌 พื้นที่: บางพลี"), "summary should include short area");
  assert(summary.includes("🗓 วันนัด: 26 เม.ย. 2569"), "summary should render absolute Thai date without recomputing weekday text");
  assert(summary.includes("⏰ เวลา: 14:00"), "summary should render exact time");
  assert(summary.includes("🏠 ประเภทหน้างาน: คอนโด"), "summary should preserve building type");
  assert(!summary.includes("🚗 ที่จอดรถ"), "summary must not include parking line");
  assert(!summary.includes("🚶 ระยะเดิน"), "summary must not include walking distance line");

  console.log("verify-repair-regressions: PASS");
}

main().catch((error) => {
  console.error("verify-repair-regressions: FAIL");
  console.error(error);
  process.exit(1);
});
