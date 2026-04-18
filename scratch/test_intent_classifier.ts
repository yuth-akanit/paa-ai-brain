import { classifyIntent } from "@/lib/ai/intent-classifier";

const cases = [
  {
    message: "รับล้างแอร์แถวมาบตาพุดไหม",
    expected: "faq_service_area"
  },
  {
    message: "จะจองล้างแอร์ครับ",
    expected: "cleaning_request"
  },
  {
    message: "ล้างแอร์ติดผนังราคาเท่าไหร่",
    expected: "faq_pricing"
  }
];

async function main() {
  for (const testCase of cases) {
    const result = await classifyIntent(testCase.message, null, { disableRemote: true });
    console.log(JSON.stringify({
      message: testCase.message,
      expected: testCase.expected,
      actual: result.intent,
      confidence: result.confidence
    }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
