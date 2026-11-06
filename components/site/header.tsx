import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { publicUrl } from "@/lib/storage";
import { HeaderNavigation } from "./header-navigation";

export async function Header() {
  const supabase = createClient();
  const [{ data: { user } }, { data: store }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("store_settings").select("store_name, logo_path").maybeSingle(),
  ]);
  let roles: string[] = [];
  if (user) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    roles = (data ?? []).map((r) => r.role);
  }
  const staff = roles.includes("admin");

  return <HeaderNavigation
    storeName={store?.store_name ?? "Store"}
    logoUrl={publicUrl("store-assets", store?.logo_path)}
    signedIn={!!user}
    staff={staff}
    developer={roles.includes("developer")}
  />;
}

export function Footer() {
  const links = [["terms", "Terms"], ["privacy", "Privacy"], ["refund-policy", "Refunds"], ["shipping-policy", "Delivery"],
    ["crypto-payment-policy", "Crypto payments"], ["faq", "FAQ"], ["about", "About"]];
  return (
    <footer className="mt-16 border-t border-paper-line bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-5 px-4 py-4 text-sm text-ink-soft">
        {links.map(([s, l]) => <Link key={s} href={`/${s}`} className="inline-flex min-h-[40px] items-center hover:underline">{l}</Link>)}
      </div>
    </footer>
  );
}
