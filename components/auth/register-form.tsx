"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/ui/field";
import {
  PASSWORD_RULES, emailSchema, fieldError, nameSchema, registerSchema,
} from "@/lib/validation";

type Touched = Partial<Record<"fullName" | "email" | "password" | "confirm", boolean>>;

export function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ fullName: "", email: "", password: "", confirm: "" });
  const [accept, setAccept] = useState(false);
  const [touched, setTouched] = useState<Touched>({});
  const [busy, setBusy] = useState(false);
  const touch = (k: keyof Touched) => setTouched((t) => ({ ...t, [k]: true }));

  // Errors are recomputed on every keystroke; they are only SHOWN once the
  // field has been touched, so people are never shouted at mid-first-character.
  const errors = useMemo(() => ({
    fullName: fieldError(nameSchema, v.fullName),
    email: fieldError(emailSchema, v.email),
    password: PASSWORD_RULES.every((r) => r.test(v.password)) ? null : "Password does not meet all requirements",
    confirm: v.confirm && v.confirm === v.password ? null : v.confirm ? "Passwords don't match" : "Confirm your password",
  }), [v]);

  const allValid = Object.values(errors).every((e) => e === null) && accept;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = registerSchema.safeParse({ ...v, acceptTerms: accept });
    if (!parsed.success) {
      setTouched({ fullName: true, email: true, password: true, confirm: true });
      toast("error", "Please fix the highlighted fields.");
      return;
    }
    setBusy(true);
    const r = await postJson("/api/auth/register", parsed.data);
    setBusy(false);
    if (!r.ok) { toast("error", r.message ?? "We couldn't create that account. Check your details and try again."); return; }
    toast("success", "Account created. Check your email to verify it.");
    router.push("/verify-email");
  }

  return (
    <form onSubmit={submit} noValidate className="card space-y-3">
      <Field label="Full name" value={v.fullName} autoComplete="name"
        onChange={(x) => setV({ ...v, fullName: x })} onBlur={() => touch("fullName")}
        error={errors.fullName} valid={!errors.fullName} touched={!!touched.fullName} />
      <Field label="Email" type="email" value={v.email} autoComplete="email"
        onChange={(x) => setV({ ...v, email: x })} onBlur={() => touch("email")}
        error={errors.email} valid={!errors.email} touched={!!touched.email} />
      <Field label="Password" type="password" value={v.password} autoComplete="new-password"
        onChange={(x) => { setV({ ...v, password: x }); touch("password"); }} onBlur={() => touch("password")}
        error={errors.password} valid={!errors.password} touched={!!touched.password}>
        <ul className="mb-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(v.password);
            return (
              <li key={r.id} className={ok ? "text-ok" : "text-ink-mute"}>
                <span aria-hidden>{ok ? "✓" : "○"}</span> {r.label}
              </li>
            );
          })}
        </ul>
      </Field>
      <Field label="Confirm password" type="password" value={v.confirm} autoComplete="new-password"
        onChange={(x) => { setV({ ...v, confirm: x }); touch("confirm"); }} onBlur={() => touch("confirm")}
        error={errors.confirm} valid={!errors.confirm} touched={!!touched.confirm} />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>
          I agree to the <Link href="/terms" className="underline">Terms</Link> and the{" "}
          <Link href="/crypto-payment-policy" className="underline">Crypto Payment Policy</Link>, including that all sales are final.
        </span>
      </label>

      <button className="btn w-full" disabled={busy || !allValid}>
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="text-center text-sm text-ink-soft">
        Already registered? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </form>
  );
}
