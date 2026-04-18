import { deleteKnowledgeFromProvider } from "@/lib/data/knowledge-provider";
import { jsonResponse } from "@/lib/utils";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteKnowledgeFromProvider(id);
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "internal_error"
      },
      { status: 500 }
    );
  }
}
