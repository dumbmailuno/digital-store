"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { postJson } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/ui/field";
import { emailSchema, fieldError } from "@/lib/validation";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [busy, setBusy] = useState(false);

  const errors = useMemo(() => ({
    email: fieldError(emailSchema, email),
    password: password ? null : "Enter your password",
  }), [email, password]);

  // only follow same-site relative redirects (prevents open-redirect abuse)
  const rawNext = params.get("next") ?? "/account";
  const explicitNext = params.get("next") !== null;
  const safeNext = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/account";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (errors.email || errors.password) {
      setTouched({ email: true, password: true });
      return;
    }
    setBusy(true);
    // sign-in runs on the server so it can be rate-limited; wrong email and wrong password look identical
    const r = await postJson<{ step: "done" | "totp" | "email_code"; home?: string }>("/api/auth/login", { email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (!r.ok) { toast("error", r.message ?? "Incorrect email or password."); return; }
    // with no explicit destination, each role lands on its own dashboard (customer, admin, or developer)
    const next = explicitNext ? safeNext : r.data?.home ?? "/account";
    if (r.data?.step === "totp") { router.push(`/login/mfa?next=${encodeURIComponent(next)}`); return; }
    if (r.data?.step === "email_code") { router.push(`/login/verify-code?next=${encodeURIComponent(next)}`); return; }
    toast("success", "Welcome back.");
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="card space-y-3">
      <Field label="Email" type="email" value={email} autoComplete="email"
        onChange={setEmail} onBlur={() => setTouched((t) => ({ ...t, email: true }))}
        error={errors.email} valid={!errors.email} touched={touched.email} />
      <Field label="Password" type="password" value={password} autoComplete="current-password"
        onChange={setPassword} onBlur={() => setTouched((t) => ({ ...t, password: true }))}
        error={errors.password} valid={false} touched={touched.password} />
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="inline-block py-2 underline">Forgot password?</Link>
      </div>
      <button className="btn w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-sm text-ink-soft">
        New here? <Link href="/register" className="underline">Create an account</Link>
      </p>
    </form>
  );
}
