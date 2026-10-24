import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOriginJson, handleError, HttpError, readJson } from "@/lib/http";
import { limitIp, rateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

const body = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

export async function POST(req: NextRequest) {
  try {
    assertSameOriginJson(req);
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_request", "Enter a valid email address.");
    await limitIp(req, "forgot", 10, 3600, true);
    await rateLimit("forgot-email", parsed.data.email, 3, 3600, true);
    const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    // same answer whether or not the account exists
    await createClient().auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${site}/auth/callback?next=/reset-password` });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
