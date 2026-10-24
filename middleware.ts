import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { OTP_COOKIE, sessionIdFromJwt, verifyOtpCookie } from "@/lib/otp-cookie";

/**
 * Runs on every request, before any page or API code:
 *  1. refreshes the Supabase session cookie
 *  2. enforces the subscription / maintenance lock (developer is exempt)
 *  3. guards /admin (admin only) and /dev (developer only) by role
 * The database enforces the same rules through RLS, so bypassing this
 * middleware still gets you nothing.
 */
// /api/cron is protected by its own secret and must keep running (expiry, retries) during maintenance.
const ALWAYS_OPEN = ["/maintenance", "/login", "/auth", "/verify-email", "/forgot-password", "/reset-password", "/account/security",
  "/_next", "/favicon.ico", "/terms", "/privacy", "/api/cron", "/api/auth"];

// Customers with email codes turned on must pass one before these. Public browsing and download links stay open.
const OTP_EXEMPT = ["/login", "/auth", "/api/auth", "/api/cron", "/api/download", "/api/payment-methods", "/_next", "/maintenance"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list: { name: string; value: string; options: CookieOptions }[]) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() validates the token with Supabase (getSession() alone is not trustworthy)
  const { data: { user } } = await supabase.auth.getUser();

  let roles: string[] = [];
  if (user) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    roles = (data ?? []).map((r) => r.role);
  }
  const isDeveloper = roles.includes("developer");
  const isAdmin = roles.includes("admin");

  // 2. store lock
  const exempt = ALWAYS_OPEN.some((p) => pathname.startsWith(p));
  if (!exempt && !isDeveloper) {
    const { data: open } = await supabase.rpc("store_is_open");
    if (open === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/maintenance";
      url.search = "";
      return NextResponse.rewrite(url, { status: 503 });
    }
  }

  // 3. role guards (return 404, not 403, so these routes are not advertised)
  const notFound = () => NextResponse.rewrite(new URL("/404", request.url), { status: 404 });
  const isDevPath = pathname === "/dev" || pathname.startsWith("/dev/");
  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  if (isDevPath && !isDeveloper) return notFound();
  // /dev is developer-only. /admin is the store admin's; the developer gets in only while the admin has
  // switched on read-only support access (the database enforces the read-only part).
  if (isAdminArea && !isAdmin) {
    let support = false;
    if (isDeveloper) {
      const { data: st } = await supabase.from("store_settings").select("developer_support_access").maybeSingle();
      support = st?.developer_support_access === true;
    }
    if (!support) return notFound();
  }

  // privileged areas additionally require a verified authenticator code (AAL2)
  if ((isDevPath || isAdminArea) && user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      const url = request.nextUrl.clone();
      url.search = "";
      if (aal?.nextLevel === "aal2") { url.pathname = "/login/mfa"; url.searchParams.set("next", pathname); }
      else { url.pathname = "/account/security"; url.searchParams.set("required", "1"); }
      return NextResponse.redirect(url);
    }
  }

  const protectedCustomer = ["/account", "/checkout", "/payment", "/order"];

  // customer email-code 2FA (staff use the authenticator app instead)
  if (user && !isAdmin && !isDeveloper) {
    const gated = protectedCustomer.some((p) => pathname.startsWith(p)) || pathname.startsWith("/api/");
    if (gated && !OTP_EXEMPT.some((p) => pathname.startsWith(p))) {
      const { data: prof } = await supabase.from("profiles").select("email_otp_2fa").eq("id", user.id).maybeSingle();
      if (prof?.email_otp_2fa === true) {
        const { data: { session } } = await supabase.auth.getSession();
        const sid = sessionIdFromJwt(session?.access_token);
        if (!verifyOtpCookie(request.cookies.get(OTP_COOKIE)?.value, user.id, sid)) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ error: { code: "otp_required", message: "Enter your email code to continue." } }, { status: 403 });
          }
          const url = request.nextUrl.clone();
          url.pathname = "/login/verify-code";
          url.search = "";
          url.searchParams.set("next", pathname);
          return NextResponse.redirect(url);
        }
      }
    }
  }
  if (!user && protectedCustomer.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
