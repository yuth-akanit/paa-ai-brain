import { listAdminCases } from "@/lib/data/cases-provider";
import { jsonResponse } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "all";
    const data = await listAdminCases(status);

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
