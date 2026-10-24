import "server-only";
import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { sendEmail, templates } from "@/lib/email/send";
import { OTP_COOKIE, OTP_COOKIE_MAX_AGE, otpSecret, sessionIdFromJwt, signOtpCookie } from "@/lib/otp-cookie";

export type OtpPurpose = "login" | "enable" | "disable";
export const OTP_TTL_SECONDS = 600;
export const OTP_COOLDOWN_SECONDS = 30;
export const OTP_MAX_ATTEMPTS = 5;

const hashCode = (userId: string, purpose: OtpPurpose, code: string) =>
  bytesToHex(sha256(utf8ToBytes(`${code}|${userId}|${purpose}|${otpSecret()}`)));

function requireSecret() {
  if (!otpSecret()) {
    console.error("[otp] OTP_COOKIE_SECRET is missing or shorter than 32 characters");
    throw new HttpError(503, "twofactor_unavailable", "Email verification isn't available right now. Please contact the store.");
  }
}

/** Emails a fresh 6-digit code. Returns false if one was sent very recently (cooldown). */
export async function issueCode(user: { id: string; email: string; name: string }, purpose: OtpPurpose) {
  requireSecret();
  await rateLimit("otp-send", user.id, 6, 3600, true);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { data, error } = await createServiceClient().rpc("otp_issue", {
    p_user: user.id, p_purpose: purpose, p_hash: hashCode(user.id, purpose, code),
    p_ttl_seconds: OTP_TTL_SECONDS, p_cooldown_seconds: OTP_COOLDOWN_SECONDS,
  });
  if (error) throw error;
  if (data === false) return false;
  const tpl = templates.loginCode(user.name, code, purpose, OTP_TTL_SECONDS / 60);
  const sent = await sendEmail({ to: user.email, ...tpl, template: "login_code", recipientId: user.id, critical: true });
  if (!sent) throw new HttpError(502, "email_failed", "We couldn't send the code. Please try again shortly.");
  return true;
}

/** Throws a friendly HttpError unless the code is right. */
export async function checkCode(userId: string, purpose: OtpPurpose, code: string) {
  requireSecret();
  await rateLimit("otp-verify", userId, 15, 900, true);
  const { data, error } = await createServiceClient().rpc("otp_verify", {
    p_user: userId, p_purpose: purpose, p_hash: hashCode(userId, purpose, code), p_max_attempts: OTP_MAX_ATTEMPTS,
  });
  if (error) throw error;
  if (data === "ok") return;
  if (data === "wrong") throw new HttpError(400, "wrong_code", "That code isn't right. Check it and try again.");
  throw new HttpError(400, "code_expired", "That code has expired or was used too many times. Request a new one.");
}

export async function setEmailTwoFactor(userId: string, enabled: boolean) {
  const { error } = await createServiceClient().rpc("otp_set_enabled", { p_user: userId, p_enabled: enabled });
  if (error) throw error;
}

/** Marks this browser session as having passed the emailed code. */
export async function grantOtpCookie(userId: string) {
  const { data: { session } } = await createClient().auth.getSession();
  cookies().set(OTP_COOKIE, signOtpCookie(userId, sessionIdFromJwt(session?.access_token)), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: OTP_COOKIE_MAX_AGE,
  });
}

export const clearOtpCookie = () => cookies().delete(OTP_COOKIE);
