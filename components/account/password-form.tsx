"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/ui/field";
import { fieldError, passwordSchema } from "@/lib/validation";

/** Shared by "change password" (signed in) and "reset password" (arrived via email link). */
export function PasswordForm({ onDone, submitLabel = "Update password" }: { onDone?: () => void; submitLabel?: string }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [t, setT] = useState({ pw: false, confirm: false });
  const [busy, setBusy] = useState(false);

  const errs = useMemo(() => ({
    pw: fieldError(passwordSchema, pw),
    confirm: confirm && confirm === pw ? null : confirm ? "Passwords don't match" : "Confirm your password",
  }), [pw, confirm]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (errs.pw || errs.confirm) { setT({ pw: true, confirm: true }); return; }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast("error", "Couldn't update your password. If this keeps happening, request a new reset link."); return; }
    toast("success", "Password updated");
    setPw(""); setConfirm(""); setT({ pw: false, confirm: false });
    onDone?.();
  }

  return (
    <form onSubmit={submit} noValidate className="card space-y-3">
      <Field label="New password" type="password" value={pw} autoComplete="new-password"
        onChange={(v) => { setPw(v); setT((s) => ({ ...s, pw: true })); }} onBlur={() => setT((s) => ({ ...s, pw: true }))}
        error={errs.pw} valid={!errs.pw} touched={t.pw} hint="Use at least 8 characters." />
      <Field label="Confirm new password" type="password" value={confirm} autoComplete="new-password"
        onChange={(v) => { setConfirm(v); setT((s) => ({ ...s, confirm: true })); }} onBlur={() => setT((s) => ({ ...s, confirm: true }))}
        error={errs.confirm} valid={!errs.confirm} touched={t.confirm} />
      <button className="btn" disabled={busy}>{busy ? "Updating…" : submitLabel}</button>
    </form>
  );
}
