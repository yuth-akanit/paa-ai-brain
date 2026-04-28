import { getEnv } from "@/lib/env";
import { selectOpenRouterModel, type RouteInput } from "./router";

export type CompletionOptions = {
  disableRemote?: boolean;
  imageBase64?: string | null;
  routing?: RouteInput;
};

export async function runJsonCompletion(prompt: string, options?: CompletionOptions) {
  if (options?.disableRemote) {
    return null;
  }

  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  // Determine model via Multi-Model Router
  const routingInput: RouteInput = {
    userText: prompt,
    imageUrl: options?.imageBase64 || undefined,
    stickerId: options?.routing?.stickerId,
    confidence: options?.routing?.confidence,
    extractionFailed: options?.routing?.extractionFailed,
    highValueCase: options?.routing?.highValueCase,
  };

  const { model, routeReason } = selectOpenRouterModel(routingInput);
  console.log(`[MODEL_ROUTER] Routing decision: ${routeReason} -> ${model}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s for complex vision tasks

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
        model: model, // Use routed model
        messages: [
          { role: "user", content }
        ],
        max_tokens: 700,
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AI_CLIENT] Error (${response.status}): ${errText}`);
      
      // Secondary fallback if primary routed model fails
      if (model !== "openai/gpt-4.1-mini") {
         console.log(`[MODEL_ROUTER] Primary failed. Attempting smart fallback...`);
         return runJsonCompletion(prompt, { ...options, routing: { ...options?.routing, extractionFailed: true } });
      }
      throw new Error(`AI request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || null;
    if (!raw) return null;
    const stripped = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    return stripped;
  } catch (err) {
    console.error("[AI_CLIENT] Request exception:", err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
