import { getEnv } from "@/lib/env";

export async function replyLineMessage(replyToken: string, text: string) {
  const env = getEnv();

  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    return {
      skipped: true
    };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "text",
          text
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to reply LINE message: ${response.status} ${body}`);
  }

  return {
    skipped: false
  };
}
export async function pushLineMessage(to: string, text: string) {
  const env = getEnv();

  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    return { skipped: true };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to,
      messages: [
        {
          type: "text",
          text
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to push LINE message: ${response.status} ${body}`);
  }

  return { skipped: false };
}

export async function getMessageContent(messageId: string): Promise<string | null> {
  const env = getEnv();
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return null;

  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  // Default to jpeg if not provided, though LINE might return headers.
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
