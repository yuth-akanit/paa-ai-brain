/**
 * Unit tests for intent classifier heuristic functions.
 * Run with: npx tsx scripts/test-heuristics.ts
 */
import { isBookingIntent, isServiceAreaQuestion, isStandardCleaningPricing } from "../lib/ai/intent-classifier";

let passed = 0;
let failed = 0;

function assert(description: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ ${description} — expected ${expected}, got ${actual}`);
    failed++;
  }
}

console.log("\n📋 isBookingIntent:");
assert("จะจองล้างแอร์ครับ → true", isBookingIntent("จะจองล้างแอร์ครับ"), true);
assert("อยากจองล้างแอร์ → true", isBookingIntent("อยากจองล้างแอร์"), true);
assert("ราคาล้างแอร์เท่าไหร่ → false", isBookingIntent("ราคาล้างแอร์เท่าไหร่"), false);
assert("สวัสดีครับ → false", isBookingIntent("สวัสดีครับ"), false);

console.log("\n📋 isServiceAreaQuestion:");
assert("รับล้างแอร์แถวมาบตาพุดไหม → true", isServiceAreaQuestion("รับล้างแอร์แถวมาบตาพุดไหม"), true);
assert("บางพลีรับไหมครับ → false", isServiceAreaQuestion("บางพลีรับไหมครับ"), false);
assert("อยู่บางนา รับงานไหมครับ → false", isServiceAreaQuestion("อยู่บางนา รับงานไหมครับ"), false);
assert("แถวลาดพร้าวรับไหม → false", isServiceAreaQuestion("แถวลาดพร้าวรับไหม"), false);
assert("ราคาล้างแอร์เท่าไหร่ → false", isServiceAreaQuestion("ราคาล้างแอร์เท่าไหร่"), false);
assert("สวัสดีครับ → false", isServiceAreaQuestion("สวัสดีครับ"), false);

console.log("\n📋 isStandardCleaningPricing:");
assert("ราคาล้างแอร์เท่าไหร่ → true", isStandardCleaningPricing("ราคาล้างแอร์เท่าไหร่"), true);
assert("ค่าล้างแอร์กี่บาท → true", isStandardCleaningPricing("ค่าล้างแอร์กี่บาท"), true);
assert("จะจองล้างแอร์ครับ → false", isStandardCleaningPricing("จะจองล้างแอร์ครับ"), false);
assert("รับล้างแอร์แถวมาบตาพุดไหม → false", isStandardCleaningPricing("รับล้างแอร์แถวมาบตาพุดไหม"), false);

console.log("\n" + "=".repeat(40));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("❌ Some tests failed!");
  process.exit(1);
} else {
  console.log("✅ All tests passed!");
}
