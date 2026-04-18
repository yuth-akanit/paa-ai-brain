const API_URL = "http://localhost:3000/api/ai/respond";

const scenarios = [
  {
    name: "Standard Repair Request",
    payload: {
      channel: "line",
      channelUserId: "U_TEST_001",
      customerMessage: "แอร์เสียครับ มีน้ำหยด ห้องนอน",
      sourceEvent: { replyToken: "test-token", messageId: "msg-001", timestamp: Date.now() },
      runtime: { requestId: "req_001", receivedAt: new Date().toISOString(), mode: "test" }
    },
    expectedAction: "reply_customer"
  },
  {
    name: "Specialized Cold Room Request",
    payload: {
      channel: "line",
      channelUserId: "U_TEST_002",
      customerMessage: "สนใจติดตั้งห้องเย็นสำหรับโรงงานครับ",
      sourceEvent: { replyToken: "test-token", messageId: "msg-002", timestamp: Date.now() },
      runtime: { requestId: "req_002", receivedAt: new Date().toISOString(), mode: "test" }
    },
    expectedAction: "handoff_admin"
  },
  {
    name: "Malformed Inbound (Missing Fields)",
    payload: {
      channel: "line",
      // missing channelUserId
      customerMessage: "hello",
      runtime: { requestId: "req_003", receivedAt: new Date().toISOString(), mode: "test" }
    },
    expectedCode: 400,
    expectedAction: "handoff_admin"
  }
];

async function runTests() {
  console.log("🚀 Starting Runtime API Integration Dry-Run...");
  console.log("--------------------------------------------------");

  for (const scene of scenarios) {
    try {
      console.log(`\nTEST: ${scene.name}`);
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scene.payload)
      });

      const data: any = await res.json();
      const status = res.status;

      console.log(`  - HTTP Status: ${status}`);
      console.log(`  - Action: ${data.recommended_action}`);
      console.log(`  - Intent: ${data.intent}`);
      console.log(`  - Logic Fallback: ${data.decision_meta?.used_fallback}`);

      if (scene.expectedCode && status !== scene.expectedCode) {
        console.error(`  ❌ FAILED: Expected status ${scene.expectedCode}, got ${status}`);
      } else if (scene.expectedAction && data.recommended_action !== scene.expectedAction) {
        console.error(`  ❌ FAILED: Expected action ${scene.expectedAction}, got ${data.recommended_action}`);
      } else {
        console.log(`  ✅ PASSED`);
      }
    } catch (error) {
      console.error(`  ❌ CRITICAL ERROR: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log("\n--------------------------------------------------");
  console.log("🏁 Dry-Run Completed.");
}

runTests();
