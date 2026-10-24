import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/origin";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) { super(message); }
}

export const fail = (status: number, code: string, message: string, retryAfter?: number) =>
  NextResponse.json({ error: { code, message } }, { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined });

/** Turn any thrown value into a safe response. Internals are logged, never returned. */
export function handleError(e: unknown) {
  if (e instanceof HttpError) return fail(e.status, e.code, e.message, e.retryAfter);
  console.error("[api]", e);
  return fail(500, "internal", "Something went wrong. Please try again.");
}

/** CSRF defence for cookie-authenticated POSTs: same-origin + JSON only. */
export function assertSameOriginJson(req: NextRequest) {
  assertSameOrigin(req);
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "bad_content_type", "Expected JSON.");
  }
}

export function assertSameOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host");
  if (!isSameOrigin(req.headers.get("origin"), host, process.env.NEXT_PUBLIC_SITE_URL)) {
    throw new HttpError(403, "bad_origin", "Request blocked.");
  }
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try { return await req.json(); } catch { throw new HttpError(400, "bad_json", "Invalid request body."); }
}

/** Signed-in, email-verified, active customer (or staff). */
export async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, "unauthenticated", "Please sign in.");
  if (!user.email_confirmed_at) throw new HttpError(403, "email_unverified", "Please verify your email first.");
  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active) throw new HttpError(403, "account_disabled", "This account is disabled.");
  return { user, supabase };
}

/** The store admin only. The developer is deliberately not allowed here. */
export async function requireAdmin() {
  const ctx = await requireUser();
  const { data } = await ctx.supabase.rpc("is_admin");
  if (data !== true) throw new HttpError(404, "not_found", "Not found.");
  const { data: aal } = await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") throw new HttpError(403, "mfa_required", "Two-factor verification required.");
  return ctx;
}
