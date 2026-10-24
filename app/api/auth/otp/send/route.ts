import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOriginJson, handleError, HttpError, readJson, requireUser } from "@/lib/http";
import { limitIp } from "@/lib/ratelimit";
import { issueCode, OTP_COOLDOWN_SECONDS } from "@/lib/otp";
import { assertPurposeAllowed } from "@/lib/otp-rules";

const body = z.object({ purpose: z.enum(["login", "enable", "disable"]) });

export async function POST(req: NextRequest) {
  try {
    assertSameOriginJson(req);
    const { user, supabase } = await requireUser();
    await limitIp(req, "otp-send", 30, 3600, true);
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_request", "Invalid request.");
    const profile = await assertPurposeAllowed(supabase, user.id, parsed.data.purpose);
    const sent = await issueCode({ id: user.id, email: profile.email, name: profile.full_name }, parsed.data.purpose);
    return NextResponse.json({ sent, retryAfter: OTP_COOLDOWN_SECONDS });
  } catch (e) { return handleError(e); }
}
