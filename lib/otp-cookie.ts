import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Proof that this browser session passed the emailed code.
 * Signed with OTP_COOKIE_SECRET and bound to the user AND the Supabase session id, so it cannot be
 * moved to another account, and a fresh sign-in always asks for a fresh code.
 * Edge-safe (pure JS), because the middleware checks it.
 */
export const OTP_COOKIE = "otp_ok";
export const OTP_COOKIE_MAX_AGE = 14 * 24 * 3600;

export const otpSecret = () => {
  const s = process.env.OTP_COOKIE_SECRET ?? "";
  return s.length >= 32 ? s : null;
};

const mac = (secret: string, payload: string) => bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(payload)));

export function signOtpCookie(userId: string, sessionId: string, nowSec = Math.floor(Date.now() / 1000)) {
  const secret = otpSecret();
  if (!secret) throw new Error("OTP_COOKIE_SECRET must be set (32+ characters)");
  const payload = `${userId}.${sessionId}.${nowSec + OTP_COOKIE_MAX_AGE}`;
  return `${payload}.${mac(secret, payload)}`;
}

export function verifyOtpCookie(value: string | undefined, userId: string, sessionId: string, nowSec = Math.floor(Date.now() / 1000)) {
  const secret = otpSecret();
  if (!secret || !value) return false;
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  const [u, s, exp, sig] = parts;
  if (u !== userId || s !== sessionId || !(Number(exp) > nowSec)) return false;
  const want = mac(secret, `${u}.${s}.${exp}`);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** The `session_id` claim of a Supabase access token (not trusted for identity, only to bind the cookie). */
export function sessionIdFromJwt(token: string | undefined | null) {
  try {
    const b64 = token!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return typeof json.session_id === "string" ? json.session_id : "-";
  } catch { return "-"; }
}
