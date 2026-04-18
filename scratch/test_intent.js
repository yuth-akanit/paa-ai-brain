
const API_URL = 'http://localhost:3011/api/ai/respond';
const API_KEY = 'PAA_BRAIN_SECURE_98de237f';

async function testIntent() {
  const payload = {
    channel: 'line',
    channelUserId: 'test_user_intent_debug',
    customerMessage: 'น้องต่าย มีคิวว่างวันไหนบ้างคับ',
    sourceEvent: { replyToken: 'test_token', messageId: 'test_msg_id', timestamp: Date.now() },
    runtime: { requestId: 'debug_test_' + Date.now(), receivedAt: new Date().toISOString(), mode: 'line_text_inbound' }
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-gateway-key': API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

testIntent();
