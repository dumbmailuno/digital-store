import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmailTwoFactor } from "@/components/account/email-two-factor";
import { TotpManager } from "@/components/account/totp-manager";

export const metadata: Metadata = { title: "Two-factor authentication" };
export const dynamic = "force-dynamic";

export default async function Security({ searchParams }: { searchParams: { required?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let staff = false;
  let emailOn = false;
  if (user) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    staff = (data ?? []).some((r) => r.role === "admin" || r.role === "developer");
    const { data: p } = await supabase.from("profiles").select("email_otp_2fa").eq("id", user.id).maybeSingle();
    emailOn = p?.email_otp_2fa === true;
  }
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-8">
      <Link href="/account" className="text-sm underline">← Account</Link>
      <h1 className="page-title">Two-factor authentication</h1>
      {!staff && <EmailTwoFactor enabled={emailOn} />}
      <TotpManager required={staff || searchParams.required === "1"} />
    </main>
  );
}
