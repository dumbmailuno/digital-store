import type { Metadata } from "next";
import { Suspense } from "react";
import { TotpChallenge } from "@/components/auth/totp-challenge";

export const metadata: Metadata = { title: "Two-factor verification" };

export default function Mfa() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <h1 className="page-title mb-6">Two-factor verification</h1>
      <Suspense><TotpChallenge /></Suspense>
    </main>
  );
}
