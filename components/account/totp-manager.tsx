"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

type Factor = { id: string; status: string };
type Enrol = { id: string; qr: string; secret: string };

export function TotpManager({ required }: { required: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [factor, setFactor] = useState<Factor | null | undefined>(undefined);
  const [enrol, setEnrol] = useState<Enrol | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const { data } = await createClient().auth.mfa.listFactors();
    setFactor(data?.totp?.find((f) => f.status === "verified") ?? null);
  }
  useEffect(() => { refresh(); }, []);

  async function start() {
    setBusy(true); setErr(null);
    const supabase = createClient();
    // clear any half-finished enrolment first (otherwise enrol fails with a duplicate-name error)
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of (all as any)?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) { toast("error", "Couldn't start setup. Please try again."); return; }
    setEnrol({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enrol || !/^\d{6}$/.test(code)) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrol.id });
    if (chErr || !ch) { setBusy(false); setErr("Couldn't verify. Please try again."); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId: enrol.id, challengeId: ch.id, code });
    setBusy(false);
    if (error) { setErr("That code didn't match. Wait for the next code and try again."); setCode(""); return; }
    toast("success", "Two-factor authentication is on");
    setEnrol(null); setCode(""); await refresh(); router.refresh();
  }

  async function disable() {
    if (!factor || required) return;
    if (!confirmDisable) { setConfirmDisable(true); return; }
    setBusy(true);
    const { error } = await createClient().auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false); setConfirmDisable(false);
    if (error) { toast("error", "Couldn't turn it off. You may need to verify with your authenticator again first."); return; }
    toast("info", "Two-factor authentication is off"); await refresh(); router.refresh();
  }
  const [confirmDisable, setConfirmDisable] = useState(false);

  if (factor === undefined) return <div className="card text-sm text-ink-soft">Loading…</div>;

  if (enrol) return (
    <form onSubmit={confirm} noValidate className="card space-y-4">
      <p className="text-sm">1. Scan this with an authenticator app (Google Authenticator, 1Password, Authy…).</p>
      <img src={enrol.qr} alt="QR code for your authenticator app" className="mx-auto h-48 w-48 rounded-2xl border border-paper-line bg-white p-2" />
      <p className="text-xs text-ink-mute">Can't scan? Enter this key manually: <span className="break-all font-mono text-ink">{enrol.secret}</span></p>
      <div>
        <label htmlFor="c" className="block text-sm font-medium">2. Enter the 6-digit code it shows</label>
        <input id="c" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setErr(null); }}
          className={`input mt-1 text-center font-mono text-xl tracking-[0.4em] ${err ? "border-bad" : ""}`} />
        <p className="mt-1 min-h-[1.25rem] text-xs text-bad" role="alert">{err}</p>
      </div>
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Turn on"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setEnrol(null); setCode(""); }}>Cancel</button>
      </div>
    </form>
  );

  return (
    <div className="card space-y-3 text-sm">
      {required && !factor && <p className="rounded-2xl border border-warn/40 p-3 text-warn">Two-factor authentication is mandatory for your role. Set it up to continue.</p>}
      <p>Status: <b className={factor ? "text-ok" : "text-ink-soft"}>{factor ? "On" : "Off"}</b></p>
      {factor ? (
        required ? <p className="text-xs text-ink-mute">Required for your role, so it can't be turned off.</p> : (
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={disable} disabled={busy}>{confirmDisable ? "Click again to confirm" : "Turn off"}</button>
            {confirmDisable && <button className="text-xs underline" onClick={() => setConfirmDisable(false)}>Cancel</button>}
          </div>
        )
      ) : <button className="btn" onClick={start} disabled={busy}>Set up authenticator app</button>}
    </div>
  );
}
