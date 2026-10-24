import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Mail = {
  to: string; subject: string; html: string; template: string;
  recipientId?: string | null;
  /** critical mail (download links) is sent even if the email feature flag is off */
  critical?: boolean;
};

/** Sends through Resend and records the outcome. Returns true only if Resend accepted it. */
export async function sendEmail(m: Mail): Promise<boolean> {
  const sb = createServiceClient();
  const log = async (status: "sent" | "failed", providerId?: string, error?: string) => {
    await sb.from("email_events").insert({
      recipient_id: m.recipientId ?? null, template: m.template, status,
      provider_id: providerId ?? null, error: error?.slice(0, 500) ?? null,
    });
  };

  if (!m.critical) {
    const { data: flag } = await sb.from("feature_flags").select("enabled").eq("key", "email_notifications").maybeSingle();
    if (flag && flag.enabled === false) { await log("failed", undefined, "email notifications disabled"); return false; }
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    await log("failed", undefined, "email provider not configured");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM, to: [m.to], subject: m.subject, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) { await log("failed", undefined, body?.message ?? `HTTP ${res.status}`); return false; }
    await log("sent", body?.id);
    return true;
  } catch (e) {
    await log("failed", undefined, e instanceof Error ? e.message : "send error");
    return false;
  }
}

const shell = (title: string, inner: string) => `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16181d">
<div style="max-width:520px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #e3e6eb;border-radius:6px;padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>${inner}</div></div></body></html>`;

export const templates = {
  loginCode: (name: string, code: string, purpose: "login" | "enable" | "disable", minutes: number) => ({
    subject: `${code} is your verification code`,
    html: shell(purpose === "login" ? "Your sign-in code" : purpose === "enable" ? "Turn on email verification" : "Turn off email verification",
      `<p style="font-size:14px">Hi ${esc(name)}, enter this code to ${purpose === "login" ? "finish signing in" : purpose === "enable" ? "turn on two-step sign-in" : "turn off two-step sign-in"}:</p>
       <p style="font-size:30px;letter-spacing:6px;font-weight:600;margin:16px 0;font-family:ui-monospace,Menlo,monospace">${esc(code)}</p>
       <p style="font-size:12px;color:#767d8c">It expires in ${minutes} minutes and works once. We will never ask you for it by reply or phone. If you didn't try to sign in, ignore this email and consider changing your password.</p>`),
  }),
  downloadReady: (name: string, orderId: string, links: { product: string; url: string; note: string }[]) => ({
    subject: `Your download is ready (${orderId})`,
    html: shell(`Thanks, ${name}. Your payment is confirmed.`,
      `<p style="font-size:14px">Order <b>${esc(orderId)}</b></p>` +
      links.map((l) => `<p style="font-size:14px;margin:16px 0 4px"><b>${esc(l.product)}</b></p>
        <p style="margin:0 0 4px"><a href="${esc(l.url)}" style="display:inline-block;background:#2b4a7d;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px">Download</a></p>
        <p style="font-size:12px;color:#767d8c;margin:4px 0 0">${esc(l.note)}</p>`).join("") +
      `<p style="font-size:12px;color:#767d8c;margin-top:20px">Keep this email private: anyone with the link can use your downloads.</p>`),
  }),
  paymentDetected: (name: string, payId: string) => ({
    subject: `We received your payment (${payId})`,
    html: shell(`Payment detected, ${name}`, `<p style="font-size:14px">We can see your transaction for payment <b>${esc(payId)}</b> and are confirming it. You'll get another email when it's approved.</p>`),
  }),
  paymentRejected: (name: string, payId: string, note: string) => ({
    subject: `Payment ${payId} was not approved`,
    html: shell(`Payment not approved`, `<p style="font-size:14px">Hi ${esc(name)}, payment <b>${esc(payId)}</b> could not be approved. ${esc(note)}</p><p style="font-size:14px">Per our policy all sales are final. If you believe this is a mistake, reply to this email with your transaction hash.</p>`),
  }),
  paymentExpired: (name: string, payId: string) => ({
    subject: `Your payment quote ${payId} expired`,
    html: shell(`Quote expired`, `<p style="font-size:14px">Hi ${esc(name)}, the price quote for payment <b>${esc(payId)}</b> expired before we saw a payment. If you haven't sent anything, just start a new payment from your order. If you did send funds, reply with your transaction hash.</p>`),
  }),
  subscriptionDue: (daysLeft: number, expires: Date, graceEnds: Date) => ({
    subject: daysLeft > 0 ? `Store subscription expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Store subscription has expired",
    html: shell(daysLeft > 0 ? "Subscription renewal due" : "Subscription expired",
      `<p style="font-size:14px">${daysLeft > 0
        ? `The store subscription expires on <b>${esc(expires.toUTCString())}</b>.`
        : `The store subscription expired on <b>${esc(expires.toUTCString())}</b>.`}</p>
       <p style="font-size:14px">Customers and the admin lose access after <b>${esc(graceEnds.toUTCString())}</b> unless it is extended. You keep access to the developer console either way.</p>`),
  }),
  reviewNeeded: (payId: string, note: string) => ({
    subject: `Payment ${payId} needs your review`,
    html: shell(`Payment awaiting review`, `<p style="font-size:14px">Payment <b>${esc(payId)}</b>: ${esc(note)}</p><p style="font-size:14px">Open the admin dashboard to approve or reject.</p>`),
  }),
};
