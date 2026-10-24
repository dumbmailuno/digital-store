import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOriginJson, handleError, HttpError, readJson, requireUser } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { createPaymentQuote } from "@/lib/payments/service";

const body = z.object({
  orderId: z.string().regex(/^ORD-\d{8}-[0-9A-F]{5}$/),
  walletId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    assertSameOriginJson(req);
    const { user } = await requireUser();
    await rateLimit("quote", user.id, 15, 600);
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_request", "Invalid request.");
    return NextResponse.json(await createPaymentQuote(user.id, parsed.data.orderId, parsed.data.walletId), { status: 201 });
  } catch (e) { return handleError(e); }
}
