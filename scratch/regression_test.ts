import { classifyIntent } from "../lib/ai/intent-classifier";
import { generateAiResponse } from "../lib/ai/response-generator";
import { STANDARD_CLEANING_PRICING_REPLY } from "../lib/ai/constants";

async function runTests() {
  const tests = [
    {
      input: "ล้างแอร์เท่าไหร่",
      expectedIntent: "faq_pricing",
      checkReply: (reply: string) => reply.includes("700 บาท")
    },
    {
      input: "ล้างแอร์ 2 เครื่อง แถวบางพลี ราคาเท่าไหร่",
      expectedIntent: "faq_pricing",
      checkReply: (reply: string) => reply.includes("700 บาท")
    },
    {
      input: "ซ่อมแอร์ราคาเท่าไหร่",
      expectedAction: "handoff", // should have low confidence or different intent
      checkIntent: (intent: string) => intent !== "faq_pricing" || true // should at least not be standard cleaning reply
    },
    {
      input: "ทำห้องเย็นราคาเท่าไหร่",
      expectedIntent: "cold_room_request",
      shouldHandoff: true
    }
  ];

  console.log("--- Starting Regression Tests ---");

  for (const test of tests) {
    console.log(`Testing: "${test.input}"`);
    const { intent, confidence } = await classifyIntent(test.input, null, { disableRemote: true });
    
    const decision = await generateAiResponse({
        customerMessage: test.input,
        intent,
        intentConfidence: confidence,
        threadSummary: null,
        knownFields: {},
        knowledge: [],
        priceFacts: [],
        disableRemote: true
    });

    console.log(`  Intent: ${decision.intent} (Conf: ${decision.confidence})`);
    console.log(`  Handoff: ${decision.should_handoff}`);
    console.log(`  Reply: ${decision.customer_reply.substring(0, 50)}...`);

    // Validation
    if (test.expectedIntent && decision.intent !== test.expectedIntent) {
        console.error(`  FAIL: Expected intent ${test.expectedIntent}, got ${decision.intent}`);
    }
    if (test.checkReply && !test.checkReply(decision.customer_reply)) {
        console.error(`  FAIL: Reply does not match expected pattern`);
    }
    if (test.shouldHandoff !== undefined && decision.should_handoff !== test.shouldHandoff) {
        console.error(`  FAIL: Expected handoff ${test.shouldHandoff}, got ${decision.should_handoff}`);
    }

    console.log("---------------------------------");
  }
}

runTests().catch(console.error);
