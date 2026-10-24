import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOriginJson, handleError, HttpError, readJson } from "@/lib/http";
import { limitIp, rateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import { clearOtpCookie } from "@/lib/otp";

const body = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) });

/**
 * Password sign-in runs through the server so it can be rate-limited per IP and per email.
 * The wrong-email and wrong-password cases return the same message.
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOriginJson(req);
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(401, "bad_credentials", "Incorrect email or password.");
    const { email, password } = parsed.data;
    await limitIp(req, "login", 30, 600, true);
    await rateLimit("login-email", email, 8, 600, true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new HttpError(401, "bad_credentials", "Incorrect email or password.");
    clearOtpCookie();

    const { data: { user } } = await supabase.auth.getUser();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const home = async () => {
      const { data: rs } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      const r = (rs ?? []).map((x) => x.role);
      return r.includes("developer") ? "/dev" : r.includes("admin") ? "/admin" : "/account";
    };
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return NextResponse.json({ step: "totp", home: await home() });

    // customers who turned on email codes still need one (staff use the authenticator app instead)
    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user!.id),
      supabase.from("profiles").select("email_otp_2fa").eq("id", user!.id).maybeSingle(),
    ]);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    const isDev = (roles ?? []).some((r) => r.role === "developer");
    return NextResponse.json({ step: !(isAdmin || isDev) && profile?.email_otp_2fa ? "email_code" : "done", home: isDev ? "/dev" : isAdmin ? "/admin" : "/account" });
  } catch (e) { return handleError(e); }
}
