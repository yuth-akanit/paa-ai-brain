import { getEnv } from "@/lib/env";

type JsonSchemaResponse = {
  output_text?: string;
};

export async function runJsonCompletion(prompt: string, options?: { disableRemote?: boolean; imageBase64?: string | null }) {
  if (options?.disableRemote) {
    return null;
  }

  const env = getEnv();

  if (!env.OPENAI_API_KEY) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout (Claude is slower than GPT)

  try {
    const content = options?.imageBase64 
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: options.imageBase64 } }
        ]
      : prompt;

    const response = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "HTTP-Referer": "https://paa-ai-customer-service-system.com",
        "X-Title": "PAA AI Brain"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "openai/gpt-4o-mini",
        messages: [
          { role: "user", content }
        ],
        max_tokens: 1024,
        response_format: {
          type: "json_object"
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || null;
    if (!raw) return null;
    // Strip markdown code fences that Claude sometimes adds even in json_object mode
    const stripped = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    return stripped;
  } finally {
    clearTimeout(timeoutId);
  }
}
