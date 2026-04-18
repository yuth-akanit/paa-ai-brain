import { isMockMode } from "@/lib/config/app-mode";
import { getAdminCaseDetailFromProvider } from "@/lib/data/cases-provider";
import { patchAdminCase } from "@/lib/db/queries";
import { adminCasePatchSchema } from "@/lib/schemas";
import { jsonResponse } from "@/lib/utils";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await getAdminCaseDetailFromProvider(id);

    return jsonResponse(data);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "internal_error"
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isMockMode()) {
      return jsonResponse(
        {
          error: "mock_mode_read_only"
        },
        { status: 409 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = adminCasePatchSchema.safeParse(body);

    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = await patchAdminCase(id, parsed.data);

    return jsonResponse({
      data
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
