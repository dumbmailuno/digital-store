"use client";

import { useMemo, useState } from "react";
import { postJson } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/ui/field";
import { emailSchema, fieldError } from "@/lib/validation";

export function ForgotForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const err = useMemo(() => fieldError(emailSchema, email), [email]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (err) { setTouched(true); return; }
    setBusy(true);
    const r = await postJson("/api/auth/forgot", { email: email.trim().toLowerCase() });
    setBusy(false);
    if (!r.ok && r.status === 429) { toast("error", r.message ?? "Too many attempts. Try again later."); return; }
    // identical response whether or not the account exists (no account enumeration)
    setSent(true);
    toast("info", "If that email has an account, a reset link is on its way.");
  }

  if (sent) return <div className="card text-sm text-ink-soft">If an account exists for <b>{email}</b>, we've sent a link to reset the password. The link expires soon, so use it promptly.</div>;
  return (
    <form onSubmit={submit} noValidate className="card space-y-3">
      <Field label="Email" type="email" value={email} autoComplete="email" onChange={setEmail} onBlur={() => setTouched(true)} error={err} valid={!err} touched={touched} />
      <button className="btn w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}
