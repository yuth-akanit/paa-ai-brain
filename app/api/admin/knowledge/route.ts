import { isMockMode } from "@/lib/config/app-mode";
import { createKnowledgeFromProvider, listKnowledgeFromProvider } from "@/lib/data/knowledge-provider";
import { adminKnowledgeSchema } from "@/lib/schemas";
import { jsonResponse } from "@/lib/utils";

export async function GET() {
  try {
    const data = await listKnowledgeFromProvider();
    return jsonResponse({ data });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "internal_error"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = adminKnowledgeSchema.safeParse(body);

    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = await createKnowledgeFromProvider(parsed.data);

    return jsonResponse({ data, mode: isMockMode() ? "mock" : "live" }, { status: isMockMode() ? 202 : 201 });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "internal_error"
      },
      { status: 500 }
    );
  }
}
