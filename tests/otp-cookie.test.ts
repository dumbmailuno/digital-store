import test from "node:test";
import assert from "node:assert/strict";

import { signOtpCookie, verifyOtpCookie, sessionIdFromJwt, otpSecret } from "../lib/otp-cookie";

process.env.OTP_COOKIE_SECRET = "x".repeat(40);   // read lazily by the module, so setting it after import is fine

const NOW = 1_800_000_000;
const U = "00000000-0000-0000-0000-00000000000a";

test("a signed cookie verifies for the same user and session", () => {
  const c = signOtpCookie(U, "sess-1", NOW);
  assert.equal(verifyOtpCookie(c, U, "sess-1", NOW + 10), true);
});

test("it is bound to the user, the session and the clock", () => {
  const c = signOtpCookie(U, "sess-1", NOW);
  assert.equal(verifyOtpCookie(c, "00000000-0000-0000-0000-00000000000b", "sess-1", NOW), false, "other user");
  assert.equal(verifyOtpCookie(c, U, "sess-2", NOW), false, "other session (new sign-in needs a new code)");
  assert.equal(verifyOtpCookie(c, U, "sess-1", NOW + 15 * 24 * 3600), false, "expired");
});

test("tampering is rejected", () => {
  const c = signOtpCookie(U, "sess-1", NOW);
  const parts = c.split(".");
  parts[2] = String(Number(parts[2]) + 999999);                       // stretch the expiry
  assert.equal(verifyOtpCookie(parts.join("."), U, "sess-1", NOW), false);
  assert.equal(verifyOtpCookie(c.slice(0, -1) + (c.endsWith("0") ? "1" : "0"), U, "sess-1", NOW), false);
  assert.equal(verifyOtpCookie("garbage", U, "sess-1", NOW), false);
  assert.equal(verifyOtpCookie(undefined, U, "sess-1", NOW), false);
});

test("a cookie signed with a different secret is rejected, and a short secret disables the check", () => {
  const c = signOtpCookie(U, "s", NOW);
  process.env.OTP_COOKIE_SECRET = "y".repeat(40);
  assert.equal(verifyOtpCookie(c, U, "s", NOW), false);
  process.env.OTP_COOKIE_SECRET = "short";
  assert.equal(otpSecret(), null);
  assert.equal(verifyOtpCookie(c, U, "s", NOW), false, "fails closed without a proper secret");
  assert.throws(() => signOtpCookie(U, "s", NOW));
  process.env.OTP_COOKIE_SECRET = "x".repeat(40);
});

test("session id is read from the JWT, and falls back safely", () => {
  const payload = Buffer.from(JSON.stringify({ session_id: "abc-123" })).toString("base64url");
  assert.equal(sessionIdFromJwt(`h.${payload}.s`), "abc-123");
  assert.equal(sessionIdFromJwt("not-a-jwt"), "-");
  assert.equal(sessionIdFromJwt(undefined), "-");
});
