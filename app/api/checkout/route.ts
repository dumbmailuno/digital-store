import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOriginJson, handleError, HttpError, readJson, requireUser } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { createCheckoutOrder } from "@/lib/payments/service";

const body = z.object({ productIds: z.array(z.string().uuid()).min(1).max(20) });

// The client only says WHICH products. Prices, totals and availability are decided server-side.
export async function POST(req: NextRequest) {
  try {
    assertSameOriginJson(req);
    const { user } = await requireUser();
    await rateLimit("checkout", user.id, 20, 600);
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_request", "Invalid cart.");
    return NextResponse.json(await createCheckoutOrder(user.id, parsed.data.productIds), { status: 201 });
  } catch (e) { return handleError(e); }
}
