import "server-only";
import type { NextRequest } from "next/server";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { createServiceClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/http";

/**
 * Fixed-window rate limiting backed by the database (rate_limit_hit), so it works
 * across serverless instances. Keys are hashed, so no emails or IPs are stored.
 *
 * failClosed: if the limiter itself errors, block the request (use for sign-in and codes).
 * Everything else fails open, so a limiter outage never takes the shop down.
 */
export async function rateLimit(name: string, id: string, limit: number, windowSeconds: number, failClosed = false) {
  const key = `${name}:${bytesToHex(sha256(utf8ToBytes(id))).slice(0, 32)}`;
  const { data, error } = await createServiceClient().rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error || !Array.isArray(data) || !data[0]) {
    console.error("[ratelimit]", error?.message ?? "no result");
    if (failClosed) throw new HttpError(503, "try_later", "Please try again in a moment.");
    return;
  }
  if (data[0].allowed === false) {
    const wait = Number(data[0].retry_after) || windowSeconds;
    throw new HttpError(429, "rate_limited", `Too many attempts. Try again in ${wait < 90 ? `${wait} seconds` : `${Math.ceil(wait / 60)} minutes`}.`, wait);
  }
}

/**
 * Best-effort client IP. Behind Vercel/Cloudflare the first X-Forwarded-For entry is set by the
 * platform. On a host that passes the header through untouched it can be spoofed, which is why
 * sign-in and code checks are ALSO limited per account/email, which cannot be spoofed.
 */
export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export const limitIp = (req: NextRequest, name: string, limit: number, windowSeconds: number, failClosed = false) =>
  rateLimit(`${name}:ip`, clientIp(req), limit, windowSeconds, failClosed);
