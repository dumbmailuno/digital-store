import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth/forgot-form";

export const metadata: Metadata = { title: "Reset password" };

export default function Forgot() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <h1 className="page-title mb-1">Reset your password</h1>
      <p className="mb-6 text-sm text-ink-soft">Enter your email and we'll send you a reset link.</p>
      <ForgotForm />
    </main>
  );
}
