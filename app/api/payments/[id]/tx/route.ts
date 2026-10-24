import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOriginJson, handleError, HttpError, readJson, requireUser } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { submitTransaction } from "@/lib/payments/service";

const body = z.object({ txHash: z.string().trim().min(40).max(100) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOriginJson(req);
    const { user } = await requireUser();
    await rateLimit("submit-tx", user.id, 30, 600);
    if (!/^PAY-[0-9A-F]{6}$/.test(params.id)) throw new HttpError(404, "payment_not_found", "Payment not found.");
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_hash", "Enter the transaction hash from your wallet or exchange.");
    return NextResponse.json(await submitTransaction(user.id, params.id, parsed.data.txHash));
  } catch (e) { return handleError(e); }
}
