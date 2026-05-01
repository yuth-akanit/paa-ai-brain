import assert from "node:assert/strict";

import { isExplicitFaqPivot } from "@/lib/cases/conversation-signals";
import { resolveCanonicalTopic } from "@/lib/knowledge/search";

type TopicCase = {
  input: string;
  expectedTopic: string;
};

const topicCases: TopicCase[] = [
  { input: "เปิดให้บริการวันไหนบ้าง", expectedTopic: "operating_hours" },
  { input: "PAA Air Service คือร้านอะไร", expectedTopic: "business_overview" },
  { input: "ราคาอุปกรณ์ส่วนเกินงานติดตั้งแอร์", expectedTopic: "installation_extra_pricing" },
  { input: "ค่าอะไหล่และค่าตรวจเช็คแอร์", expectedTopic: "parts_and_inspection_pricing" },
  { input: "ช่องทางการติดต่อร้าน", expectedTopic: "contact_info" },
  { input: "ค่าซ่อมรั่วแอร์", expectedTopic: "repair_leak_pricing" },
];

const faqPivotCases = [
  "เปิดให้บริการวันไหนบ้าง",
  "PAA Air Service คือร้านอะไร",
  "ช่องทางการติดต่อร้าน",
  "ราคาอุปกรณ์ส่วนเกินงานติดตั้งแอร์",
  "ค่าอะไหล่และค่าตรวจเช็คแอร์",
  "ค่าซ่อมรั่วแอร์",
];

for (const testCase of topicCases) {
  const actual = resolveCanonicalTopic(testCase.input);
  assert.equal(
    actual,
    testCase.expectedTopic,
    `resolveCanonicalTopic("${testCase.input}") expected=${testCase.expectedTopic} actual=${actual}`
  );
}

for (const input of faqPivotCases) {
  assert.equal(isExplicitFaqPivot(input), true, `isExplicitFaqPivot("${input}") should be true`);
}

console.log("verify-faq-pivots: OK");
