"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { Sub } from "@/lib/subscription";

const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function SubscriptionControls({ sub }: { sub: Sub }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [fee, setFee] = useState(String(sub.monthly_fee_usd));
  const [grace, setGrace] = useState(String(sub.grace_days));
  const [expiry, setExpiry] = useState(toLocalInput(sub.expires_at));
  const [note, setNote] = useState(sub.note ?? "");

  const sb = () => createClient();
  const done = (msg: string) => { toast("success", msg); router.refresh(); };
  const denied = () => toast("error", "That wasn't allowed. Check that you're signed in with two-factor as the developer.");

  async function patch(values: Record<string, unknown>, ok: string) {
    if (busy) return;
    setBusy(true);
    const { data, error } = await sb().from("platform_subscription").update(values).eq("id", true).select("id");
    setBusy(false);
    if (error || !data?.length) { denied(); return; }
    done(ok);
  }

  async function extend(days: number) {
    if (busy) return;
    setBusy(true);
    const { data, error } = await sb().rpc("dev_extend_subscription", { p_days: days });
    setBusy(false);
    if (error || !data) { denied(); return; }
    done(`Extended by ${days} days. New expiry: ${new Date(data as string).toLocaleDateString()}`);
  }

  const feeOk = /^\d{1,7}(\.\d{1,2})?$/.test(fee);
  const expiryOk = !!expiry && !Number.isNaN(new Date(expiry).getTime());

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">Renewal</h2>
        <p className="text-xs text-ink-soft">Extending runs from the later of today or the current expiry, and sets the status back to active.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={busy} onClick={() => extend(30)}>Extend 30 days</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => extend(90)}>Extend 90 days</button>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">Emergency controls</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" disabled={busy} onClick={() => { if (confirm("Take the store offline for customers and the admin right now?")) patch({ maintenance_forced: !sub.maintenance_forced }, sub.maintenance_forced ? "Maintenance mode off" : "Maintenance mode on"); }}>
            {sub.maintenance_forced ? "Turn maintenance mode off" : "Turn maintenance mode on"}
          </button>
          {sub.status === "suspended"
            ? <button className="btn" disabled={busy} onClick={() => patch({ status: "active" }, "Store reactivated")}>Reactivate</button>
            : <button className="btn btn-ghost text-bad" disabled={busy} onClick={() => { if (confirm("Suspend the store? It goes offline immediately, regardless of the expiry date.")) patch({ status: "suspended" }, "Store suspended"); }}>Suspend store</button>}
        </div>
        <p className="text-xs text-ink-mute">You always keep access to this console. Existing orders and payments are untouched while the store is offline.</p>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold">Terms</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fee" className="mb-1 block text-sm font-medium">Monthly fee (USD)</label>
            <input id="fee" inputMode="decimal" className={`input ${feeOk ? "" : "border-bad"}`} value={fee} onChange={(e) => setFee(e.target.value.trim())} />
            <p className="mt-1 min-h-[1.25rem] text-xs text-bad">{feeOk ? "" : "Enter an amount like 25 or 25.50"}</p>
          </div>
          <div>
            <label htmlFor="grace" className="mb-1 block text-sm font-medium">Grace period after expiry</label>
            <select id="grace" className="input" value={grace} onChange={(e) => setGrace(e.target.value)}>
              {[0, 1, 2, 3, 5, 7, 10, 14].map((n) => <option key={n} value={n}>{n === 0 ? "None (offline immediately)" : `${n} day${n > 1 ? "s" : ""}`}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="exp" className="mb-1 block text-sm font-medium">Expiry date and time (your local time)</label>
            <input id="exp" type="datetime-local" className={`input sm:max-w-xs ${expiryOk ? "" : "border-bad"}`} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="note" className="mb-1 block text-sm font-medium">Private note</label>
            <textarea id="note" rows={2} maxLength={500} className="input py-2" value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="mt-1 text-xs text-ink-mute">Only you can see this.</p>
          </div>
        </div>
        <button className="btn" disabled={busy || !feeOk || !expiryOk}
          onClick={() => patch({ monthly_fee_usd: fee, grace_days: Number(grace), expires_at: new Date(expiry).toISOString(), note: note.trim() || null }, "Terms saved")}>
          Save terms
        </button>
      </section>
    </div>
  );
}
