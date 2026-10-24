import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginJson, handleError, HttpError, readJson } from "@/lib/http";
import { limitIp, rateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import { registerSchema } from "@/lib/validation";

/** Sign-up runs through the server so it can be rate-limited (each sign-up sends an email). */
export async function POST(req: NextRequest) {
  try {
    assertSameOriginJson(req);
    const parsed = registerSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_request", "Please check your details and try again.");
    const { email, password, fullName } = parsed.data;
    await limitIp(req, "register", 10, 3600, true);
    await rateLimit("register-email", email, 3, 3600, true);

    const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const { error } = await createClient().auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${site}/auth/callback?next=/account` },
    });
    if (error) {
      // the real reason goes to the server log only (see your terminal); the browser gets a safe message
      console.error("[register]", error.status, (error as { code?: string }).code, error.message);
      const code = (error as { code?: string }).code;
      if (code === "over_email_send_rate_limit" || error.status === 429) throw new HttpError(429, "email_rate_limit", "Too many sign-up emails were sent just now. Wait a few minutes and try again.");
      if (code === "signup_disabled") throw new HttpError(403, "signup_disabled", "Sign-ups are turned off right now.");
      // never reveal whether the address already has an account
      throw new HttpError(400, "signup_failed", "We couldn't create that account. Check your details and try again.");
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) { return handleError(e); }
}
