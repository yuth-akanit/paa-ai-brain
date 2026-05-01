import test from "node:test";
import assert from "node:assert/strict";

import { aiRespondRequestSchema } from "./schemas";

test("aiRespondRequestSchema accepts legacy LINE payloads", () => {
  const parsed = aiRespondRequestSchema.safeParse({
    channel: "line",
    channelUserId: "U1234567890",
    channelPlatformId: "2007958198",
    accountKey: "PAA Air",
    threadId: null,
    customerMessage: "สวัสดี",
    sourceEvent: {
      replyToken: "reply-token",
      messageId: "line-message-001",
      timestamp: Date.now()
    },
    runtime: {
      requestId: "req-line-001",
      receivedAt: new Date().toISOString(),
      mode: "line_text_inbound",
      runtimeMode: "shadow"
    }
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  assert.equal(parsed.data.channel, "line");
  assert.equal(parsed.data.sourceEvent.messageType, "text");
  assert.equal(parsed.data.sourceEvent.replyToken, "reply-token");
});

test("aiRespondRequestSchema accepts facebook payload without replyToken", () => {
  const parsed = aiRespondRequestSchema.safeParse({
    channel: "facebook",
    channelUserId: "27199538982983596",
    channelPlatformId: "100744429333873",
    accountKey: "ช่างแอร์ล้างซ่อมแอร์.com",
    threadId: null,
    customerMessage: "สวัสดี",
    sourceEvent: {
      replyToken: null,
      messageId: "m_vY0LklcPtb99weglwDMV6x08Ifur05l3b4pyVycXuY6C_Y1vSV-Ulk_2n4sZhEIGotStlYGRVFYUCq28wcLhTQ",
      messageType: "text",
      timestamp: 1777345939050
    },
    runtime: {
      requestId: "n8n_facebook_main_1777350142308_83646",
      receivedAt: "2026-04-28T04:22:22.308Z",
      mode: "facebook_text_inbound",
      runtimeMode: "shadow"
    }
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  assert.equal(parsed.data.channel, "facebook");
  assert.equal(parsed.data.sourceEvent.replyToken, null);
  assert.equal(parsed.data.sourceEvent.messageType, "text");
});

test("aiRespondRequestSchema preserves passthrough media fields", () => {
  const parsed = aiRespondRequestSchema.parse({
    channel: "facebook",
    channelUserId: "fb-user-001",
    channelPlatformId: "fb-page-001",
    accountKey: "บัญชีทดสอบ",
    customerMessage: "ส่งรูป",
    sourceEvent: {
      messageId: "fb-media-001",
      imageBase64: "ZmFrZS1pbWFnZQ==",
      mediaUrl: "https://example.com/media.jpg",
      attachmentType: "image"
    }
  });

  assert.equal(parsed.sourceEvent.messageType, "text");
  assert.equal(parsed.sourceEvent.imageBase64, "ZmFrZS1pbWFnZQ==");
  assert.equal(parsed.sourceEvent.mediaUrl, "https://example.com/media.jpg");
  assert.equal(parsed.sourceEvent.attachmentType, "image");
});

test("aiRespondRequestSchema rejects empty required identifiers", () => {
  const parsed = aiRespondRequestSchema.safeParse({
    channel: "facebook",
    channelUserId: "",
    channelPlatformId: "fb-page-001",
    accountKey: "บัญชีทดสอบ",
    customerMessage: "hello"
  });

  assert.equal(parsed.success, false);
});
