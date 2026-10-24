import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyCodeCard } from "@/components/auth/verify-code-card";

export const metadata: Metadata = { title: "Check your email" };

export default function VerifyCode() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <h1 className="mb-2 text-2xl font-semibold">Check your email</h1>
      <p className="mb-6 text-sm text-ink-soft">We sent a 6-digit code to the email on your account. Enter it to finish signing in.</p>
      <Suspense><VerifyCodeCard /></Suspense>
    </main>
  );
}
