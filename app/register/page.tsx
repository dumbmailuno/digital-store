import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <h1 className="page-title mb-1">Create your account</h1>
      <p className="mb-6 text-sm text-ink-soft">We'll check each field as you go.</p>
      <RegisterForm />
    </main>
  );
}
