"use client";

import { useRouter } from "next/navigation";
import { PasswordForm } from "@/components/account/password-form";

// Reached via /auth/callback, which has already exchanged the emailed code for a session.
export default function ResetPassword() {
  const router = useRouter();
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <h1 className="page-title mb-6">Choose a new password</h1>
      <PasswordForm submitLabel="Set new password" onDone={() => router.push("/account")} />
    </main>
  );
}
