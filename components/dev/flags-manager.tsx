"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

type Flag = { key: string; enabled: boolean; description: string | null };
type Settings = { verification_mode: "automatic" | "manual" | "hybrid"; quote_ttl_minutes: number; required_confirmations: number };

const MODES = [
  { v: "hybrid", l: "Hybrid", d: "Verify on-chain, then wait for the admin's approval" },
  { v: "automatic", l: "Automatic", d: "Approve and deliver as soon as a clean payment is verified" },
  { v: "manual", l: "Manual", d: "No chain lookup: the admin checks every payment themselves" },
] as const;

export function FlagsManager({ flags, settings }: { flags: Flag[]; settings: Settings }) {
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);

  async function toggle(f: Flag) {
    const { data, error } = await createClient().from("feature_flags").update({ enabled: !f.enabled, updated_at: new Date().toISOString() }).eq("key", f.key).select("key");
    if (error || !data?.length) { toast("error", "That wasn't allowed. Check your two-factor sign-in."); return; }
    toast("success", `${f.key.replace(/_/g, " ")} turned ${f.enabled ? "off" : "on"}`); router.refresh();
  }

  async function saveSettings() {
    if (busy) return;
    if (s.quote_ttl_minutes < 5 || s.quote_ttl_minutes > 1440 || s.required_confirmations < 1 || s.required_confirmations > 12) { toast("error", "Check the numbers: quote 5 to 1440 minutes, confirmations 1 to 12."); return; }
    setBusy(true);
    const { data, error } = await createClient().from("platform_settings").update(s).eq("id", true).select("id");
    setBusy(false);
    if (error || !data?.length) { toast("error", "That wasn't allowed. Check your two-factor sign-in."); return; }
    toast("success", "Payment settings saved"); router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">Payment verification mode</h2>
        <fieldset className="space-y-2">
          <legend className="sr-only">Verification mode</legend>
          {MODES.map((m) => (
            <label key={m.v} className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2.5 text-sm ${s.verification_mode === m.v ? "border-accent" : "border-paper-line"}`}>
              <input type="radio" name="mode" className="mt-1" checked={s.verification_mode === m.v} onChange={() => setS({ ...s, verification_mode: m.v })} />
              <span><span className="font-medium">{m.l}</span><span className="block text-xs text-ink-soft">{m.d}</span></span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-ink-mute">Automatic only takes effect while the "auto verification" flag below is on. Unusual payments (wrong amount, late, duplicate hash) always go to the admin, in every mode.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ttl" className="mb-1 block text-sm font-medium">Price quote lasts (minutes)</label>
            <input id="ttl" type="number" min={5} max={1440} className="input" value={s.quote_ttl_minutes} onChange={(e) => setS({ ...s, quote_ttl_minutes: Number(e.target.value) })} />
          </div>
          <div>
            <label htmlFor="conf" className="mb-1 block text-sm font-medium">Confirmations required</label>
            <input id="conf" type="number" min={1} max={12} className="input" value={s.required_confirmations} onChange={(e) => setS({ ...s, required_confirmations: Number(e.target.value) })} />
          </div>
        </div>
        <button className="btn" disabled={busy} onClick={saveSettings}>{busy ? "Saving…" : "Save payment settings"}</button>
      </section>

      <section className="card p-0">
        <h2 className="border-b border-paper-line px-4 py-3 text-sm font-semibold">Feature flags</h2>
        <ul className="divide-y divide-paper-line">
          {flags.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div><p className="font-mono text-sm">{f.key}</p>{f.description && <p className="text-xs text-ink-soft">{f.description}</p>}</div>
              <button role="switch" aria-checked={f.enabled} aria-label={f.key} onClick={() => toggle(f)}
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${f.enabled ? "border-accent bg-accent" : "border-paper-line bg-paper-dim"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${f.enabled ? "left-[26px]" : "left-0.5 border border-paper-line"}`} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
