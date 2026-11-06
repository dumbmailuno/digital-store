import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SubscriptionControls } from "@/components/dev/subscription-controls";
import { deriveState, type Sub } from "@/lib/subscription";
import { when } from "@/lib/labels";

export const metadata: Metadata = { title: "Subscription" };

export default async function SubscriptionPage() {
  const { data } = await createClient().from("platform_subscription").select("status, expires_at, grace_days, maintenance_forced, monthly_fee_usd, note").maybeSingle();
  const sub = data as Sub | null;
  if (!sub) return <div className="card text-sm text-bad">Couldn't read the subscription. Make sure you've completed two-factor sign-in.</div>;
  const d = deriveState(sub);
  return (
    <div className="space-y-5">
      <h1 className="page-title-sm">Subscription</h1>
      <div className="card text-sm">
        <p>Status: <b>{sub.status}</b> · {d.reason}</p>
        <p className="mt-1 text-ink-soft">Expires {when(sub.expires_at)} · customers lose access after {when(d.graceEnds.toISOString())}</p>
      </div>
      <SubscriptionControls sub={sub} />
    </div>
  );
}
