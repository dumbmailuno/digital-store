import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/http";
import type { OtpPurpose } from "@/lib/otp";

/** Which email-code actions make sense for this account right now. Staff use the authenticator app instead. */
export async function assertPurposeAllowed(supabase: SupabaseClient, userId: string, purpose: OtpPurpose) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("email, full_name, email_otp_2fa").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (!profile) throw new HttpError(404, "not_found", "Account not found.");
  if ((roles ?? []).some((r) => r.role === "admin" || r.role === "developer")) {
    throw new HttpError(400, "use_authenticator", "Staff accounts use the authenticator app.");
  }
  const on = profile.email_otp_2fa === true;
  if (purpose === "login" && !on) throw new HttpError(400, "not_enabled", "Email verification isn't turned on.");
  if (purpose === "enable" && on) throw new HttpError(400, "already_enabled", "Email verification is already on.");
  if (purpose === "disable" && !on) throw new HttpError(400, "not_enabled", "Email verification isn't turned on.");
  return profile as { email: string; full_name: string; email_otp_2fa: boolean };
}
