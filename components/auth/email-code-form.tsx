"use client";

import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";

type Purpose = "login" | "enable" | "disable";

/** Asks for the 6-digit code we email. Sends the first code when it appears, with a resend cooldown. */
export function EmailCodeForm({ purpose, onVerified, onCancel }: { purpose: Purpose; onVerified: () => void; onCancel?: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [sentOnce, setSentOnce] = useState(false);
  const started = useRef(false);
  const valid = /^\d{6}$/.test(code);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send() {
    setErr(null);
    const r = await postJson<{ sent: boolean; retryAfter: number }>("/api/auth/otp/send", { purpose });
    if (!r.ok) { setErr(r.message); if (r.retryAfter) setCooldown(r.retryAfter); return; }
    setSentOnce(true);
    setCooldown(r.data?.retryAfter ?? 30);
    if (r.data?.sent) toast("info", "We emailed you a code.");
  }
  useEffect(() => { if (!started.current) { started.current = true; send(); } /* eslint-disable-next-line */ }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    const r = await postJson("/api/auth/otp/verify", { purpose, code });
    setBusy(false);
    if (!r.ok) { setErr(r.message); setCode(""); return; }
    onVerified();
  }

  return (
    <form onSubmit={submit} noValidate className="card space-y-3">
      <label htmlFor="email-code" className="block text-sm font-medium">
        6-digit code from your email
      </label>
      <input id="email-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
        onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setErr(null); }}
        aria-invalid={!!err} aria-describedby="email-code-msg"
        className={`input text-center font-mono text-xl tracking-[0.4em] ${err ? "border-bad" : ""}`} autoFocus />
      <p id="email-code-msg" className="min-h-[1.25rem] text-xs text-bad" role="alert">{err}</p>
      <button className="btn w-full" disabled={!valid || busy}>{busy ? "Verifying…" : "Verify"}</button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="inline-block py-2 underline disabled:no-underline disabled:opacity-60" disabled={cooldown > 0} onClick={send}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : sentOnce ? "Send a new code" : "Send code"}
        </button>
        {onCancel && <button type="button" className="inline-block py-2 underline" onClick={onCancel}>Cancel</button>}
      </div>
      <p className="text-xs text-ink-mute">The code expires in 10 minutes. Check your spam folder if it doesn't arrive.</p>
    </form>
  );
}
