import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { deriveState, type Sub } from "@/lib/subscription";
import { when } from "@/lib/labels";
import { usd } from "@/lib/storage";

export const metadata: Metadata = { title: "Developer overview" };

const TONE = { online: "text-ok", warning: "text-warn", grace: "text-warn", offline: "text-bad" } as const;
const LABEL = { online: "Online", warning: "Online, renewal due", grace: "Online, in grace period", offline: "Offline to customers" } as const;

export default async function DevHome() {
  const supabase = createClient();
  const [sub, ps, health] = await Promise.all([
    supabase.from("platform_subscription").select("status, expires_at, grace_days, maintenance_forced, monthly_fee_usd, note").maybeSingle(),
    supabase.from("platform_settings").select("verification_mode, last_cron_at").maybeSingle(),
    // counts only: the developer never reads customer, order or payment rows
    supabase.rpc("dev_health"),
  ]);
  const h = (health.data ?? {}) as { failed_emails_24h?: number; stuck_approved?: number; in_review?: number; awaiting_payment?: number };
  const s = sub.data as Sub | null;
  const d = s ? deriveState(s) : null;
  const cronAt = (ps.data as any)?.last_cron_at as string | null;
  const cronOk = !!cronAt && Date.now() - new Date(cronAt).getTime() < 15 * 60_000;

  const Row = ({ label, value, bad, hint }: { label: string; value: React.ReactNode; bad?: boolean; hint?: string }) => (
    <div className="card p-4"><p className="text-xs text-ink-soft">{label}</p><p className={`mt-1 text-xl font-semibold ${bad ? "text-bad" : ""}`}>{value}</p>{hint && <p className="mt-0.5 text-xs text-ink-mute">{hint}</p>}</div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      {!s || !d ? <div className="card text-sm text-bad">Couldn't read the subscription. Make sure you've completed two-factor sign-in.</div> : (
        <section className="card space-y-1">
          <p className="text-xs text-ink-soft">Store status</p>
          <p className={`text-2xl font-semibold ${TONE[d.state]}`}>{LABEL[d.state]}</p>
          <p className="text-sm text-ink-soft">{d.reason}</p>
          <p className="pt-2 text-sm">Expires <b>{when(s.expires_at)}</b> · grace {s.grace_days} day{s.grace_days === 1 ? "" : "s"} · monthly fee {usd(s.monthly_fee_usd)}</p>
          <div className="pt-3"><Link href="/dev/subscription" className="btn">Manage subscription</Link></div>
        </section>
      )}
      <section aria-label="System health" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Row label="Background jobs" value={cronOk ? "Running" : "Not running"} bad={!cronOk} hint={cronAt ? `last run ${when(cronAt)}` : "never ran: set up the 5-minute cron"} />
        <Row label="Failed emails (24h)" value={h.failed_emails_24h ?? 0} bad={(h.failed_emails_24h ?? 0) > 0} hint="check Resend settings if above 0" />
        <Row label="Approved, not delivered" value={h.stuck_approved ?? 0} bad={(h.stuck_approved ?? 0) > 0} hint="older than 15 min" />
        <Row label="Awaiting admin review" value={h.in_review ?? 0} />
        <Row label="Open payment quotes" value={h.awaiting_payment ?? 0} />
        <Row label="Verification mode" value={(ps.data as any)?.verification_mode ?? "-"} />
      </section>
      {!cronOk && <p role="alert" className="rounded border border-bad/40 bg-paper p-3 text-sm">The background job hasn't run in the last 15 minutes. Until it does, unpaid quotes won't expire, slow payments won't be re-checked, and failed download emails won't be retried.</p>}
    </div>
  );
}
