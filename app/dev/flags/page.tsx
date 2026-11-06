import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { FlagsManager } from "@/components/dev/flags-manager";

export const metadata: Metadata = { title: "Flags & payments" };

export default async function Flags() {
  const supabase = createClient();
  const [{ data: flags }, { data: ps }] = await Promise.all([
    supabase.from("feature_flags").select("key, enabled, description").order("key"),
    supabase.from("platform_settings").select("verification_mode, quote_ttl_minutes, required_confirmations").maybeSingle(),
  ]);
  if (!ps) return <div className="card text-sm text-bad">Couldn't read settings. Make sure you've completed two-factor sign-in.</div>;
  return (
    <div className="space-y-5">
      <h1 className="page-title-sm">Flags & payments</h1>
      <FlagsManager flags={(flags ?? []) as any} settings={ps as any} />
    </div>
  );
}
