import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyEmail() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="card">
        <h1 className="page-title">Check your email</h1>
        <p className="mt-2 text-sm text-ink-soft">We sent you a verification link. Open it to activate your account and go straight to the shop. It can take a minute, and it may land in spam.</p>
        <Link href="/login" className="btn mt-6">Go to sign in</Link>
      </div>
    </main>
  );
}
