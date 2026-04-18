import { NextRequest, NextResponse } from "next/server";
import { getFollowUpCandidates, markFollowUpSent } from "@/lib/db/queries";
import { pushLineMessage } from "@/lib/line/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  
  // Security: must match CRON_SECRET (same as middleware bypass)
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const candidates = await getFollowUpCandidates(24); // Follow up after 24 hours of inactivity
    const results = [];

    for (const candidate of candidates) {
      const userId = (candidate as any).line_channel?.external_user_id;

      // LINE userId must start with 'U' and be 33 chars (e.g. U1234567890abcdef1234567890abcdef)
      if (!userId || typeof userId !== "string" || !userId.startsWith("U") || userId.length !== 33) {
        results.push({ id: candidate.id, status: "skipped", reason: "invalid_line_user_id", debug_user_id: userId ?? null });
        continue;
      }

      const message = "สวัสดีครับ สนใจรับบริการล้างแอร์หรือซ่อมแอร์เพิ่มเติมไหมครับ? หากมีข้อสงสัยหรือต้องการนัดจองคิว สอบถามทิ้งไว้ได้เลยนะครับ เดี๋ยวผมช่วยดูแลให้ครับ";

      try {
        await pushLineMessage(userId, message);
        await markFollowUpSent(candidate.id, candidate.thread_id, (candidate as any).conversation_threads?.metadata);
        results.push({ id: candidate.id, status: "sent", user_id: userId });
      } catch (err: any) {
        results.push({ id: candidate.id, status: "failed", error: err.message, user_id: userId });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      details: results
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
