"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

export function TotpChallenge() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rawNext = params.get("next") ?? "/account";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/account";
  const valid = /^\d{6}$/.test(code);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.find((f) => f.status === "verified");
    if (!factor) { setBusy(false); setErr("No authenticator is set up on this account."); return; }
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (chErr || !ch) { setBusy(false); setErr("Couldn't start verification. Please try again."); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code });
    setBusy(false);
    if (error) { setErr("That code didn't work. Check the code and try again."); setCode(""); return; }
    toast("success", "Verified");
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="card space-y-3">
      <label htmlFor="otp" className="block text-sm font-medium">6-digit code from your authenticator app</label>
      <input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
        onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setErr(null); }}
        aria-invalid={!!err} className={`input text-center font-mono text-xl tracking-[0.4em] ${err ? "border-bad" : ""}`} autoFocus />
      <p className="min-h-[1.25rem] text-xs text-bad" role="alert">{err}</p>
      <button className="btn w-full" disabled={!valid || busy}>{busy ? "Verifying…" : "Verify"}</button>
    </form>
  );
}
