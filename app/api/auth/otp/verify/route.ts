import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOriginJson, handleError, HttpError, readJson, requireUser } from "@/lib/http";
import { limitIp } from "@/lib/ratelimit";
import { checkCode, clearOtpCookie, grantOtpCookie, setEmailTwoFactor } from "@/lib/otp";
import { assertPurposeAllowed } from "@/lib/otp-rules";

const body = z.object({ purpose: z.enum(["login", "enable", "disable"]), code: z.string().regex(/^\d{6}$/) });

export async function POST(req: NextRequest) {
  try {
    assertSameOriginJson(req);
    const { user, supabase } = await requireUser();
    await limitIp(req, "otp-verify", 60, 900, true);
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_code", "Enter the 6-digit code from the email.");
    const { purpose, code } = parsed.data;
    await assertPurposeAllowed(supabase, user.id, purpose);
    await checkCode(user.id, purpose, code);

    if (purpose === "enable") { await setEmailTwoFactor(user.id, true); await grantOtpCookie(user.id); }
    else if (purpose === "disable") { await setEmailTwoFactor(user.id, false); clearOtpCookie(); }
    else await grantOtpCookie(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
