import type { ExtractedCaseFields, IntentName, ServiceType } from "@/lib/types";

export type RouteInput = {
  userText?: string;
  imageUrl?: string;
  stickerId?: string;
  confidence?: number;
  extractionFailed?: boolean;
  highValueCase?: boolean;
};

export type ModelRoute = {
  model: string;
  routeReason: string;
};

/**
 * M3 Multi-Model Router
 * Dynamically selects the best OpenRouter model based on input type and context.
 */
export function selectOpenRouterModel(input: RouteInput): ModelRoute {
  const hasImage = Boolean(input.imageUrl);
  const hasSticker = Boolean(input.stickerId);
  const lowConfidence = (input.confidence ?? 1) < 0.75;

  // Rule 1: Fallback to high-reasoning model for complex or failing cases
  if (lowConfidence || input.extractionFailed || input.highValueCase) {
    return {
      model: "openai/gpt-4.1-mini",
      routeReason: "fallback_smart",
    };
  }

  // Rule 2: Sticker processing requires a specialized lightweight vision worker
  if (hasSticker) {
    return {
      model: "rekaai/reka-edge",
      routeReason: "sticker_preclass",
    };
  }

  // Rule 3: Main HVAC vision processing
  if (hasImage) {
    return {
      model: "google/gemini-2.5-flash-lite",
      routeReason: "vision_default",
    };
  }

  // Rule 4: Default text processing
  return {
    model: "google/gemini-2.5-flash-lite",
    routeReason: "text_default",
  };
}
