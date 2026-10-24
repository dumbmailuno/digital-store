import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicUrl } from "@/lib/storage";
import { ProfileForm } from "@/components/account/profile-form";
import { PasswordForm } from "@/components/account/password-form";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function Account() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");
  const [{ data: profile }, { data: avatars }] = await Promise.all([
    supabase.from("profiles").select("public_id, full_name, email, avatar_id").eq("id", user.id).single(),
    supabase.from("avatar_assets").select("id, name, svg_path").eq("status", "active").order("name"),
  ]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Account</h1>
        <Link href="/account/orders" className="text-sm underline">My orders</Link>
      </div>
      <p className="text-sm text-ink-soft">{profile?.email} · <span className="font-mono">{profile?.public_id}</span>{!user.email_confirmed_at && <span className="ml-2 text-warn">Email not verified</span>}</p>

      <section><h2 className="mb-2 text-sm font-semibold">Profile</h2>
        <ProfileForm fullName={profile?.full_name ?? ""} avatarId={profile?.avatar_id ?? null} emailVerified={!!user.email_confirmed_at}
          avatars={(avatars ?? []).map((a) => ({ id: a.id, name: a.name, url: publicUrl("avatar-assets", a.svg_path)! }))} />
      </section>
      <section><h2 className="mb-2 text-sm font-semibold">Password</h2><PasswordForm /></section>
      <section><h2 className="mb-2 text-sm font-semibold">Two-factor authentication</h2>
        <div className="card text-sm"><p className="text-ink-soft">Protect your account with an authenticator app.</p>
          <Link href="/account/security" className="btn mt-3">Manage two-factor</Link></div>
      </section>
    </main>
  );
}
