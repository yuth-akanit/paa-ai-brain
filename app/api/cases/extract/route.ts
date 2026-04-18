import { extractStructuredFields } from "@/lib/ai/structured-extractor";
import { extractRequestSchema } from "@/lib/schemas";
import { jsonResponse } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = extractRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.flatten() }, { status: 400 });
    }

    const extracted = await extractStructuredFields(parsed.data.text, parsed.data.currentFields);

    return jsonResponse({
      extracted_fields: extracted
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "internal_error"
      },
      { status: 500 }
    );
  }
}
