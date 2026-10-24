import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOriginJson, handleError, HttpError, readJson, requireAdmin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { adminDecision } from "@/lib/payments/service";

const body = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).default("") });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOriginJson(req);
    const { user } = await requireAdmin();
    await rateLimit("admin-decision", user.id, 60, 60);
    if (!/^PAY-[0-9A-F]{6}$/.test(params.id)) throw new HttpError(404, "payment_not_found", "Payment not found.");
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_request", "Invalid request.");
    if (parsed.data.decision === "reject" && !parsed.data.note) {
      throw new HttpError(400, "note_required", "Add a short reason so the customer knows why.");
    }
    return NextResponse.json(await adminDecision(user.id, params.id, parsed.data.decision, parsed.data.note));
  } catch (e) { return handleError(e); }
}
