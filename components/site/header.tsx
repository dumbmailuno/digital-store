import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { publicUrl } from "@/lib/storage";
import { CartLink } from "./cart-link";
import { SignOutButton } from "./sign-out";

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

  return (
    <header className="border-b border-paper-line bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex min-h-[40px] items-center gap-2 text-base font-semibold">
          {store?.logo_path && <img src={publicUrl("store-assets", store.logo_path)!} alt="" className="h-7 w-auto max-w-[120px] object-contain" />}
          {store?.store_name ?? "Store"}
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 text-sm">
          <Link href="/shop" className="inline-flex min-h-[40px] items-center hover:underline">Shop</Link>
          <CartLink />
          {user ? (
            <>
              <Link href="/account" className="inline-flex min-h-[40px] items-center hover:underline">Account</Link>
              {staff && <Link href="/admin" className="inline-flex min-h-[40px] items-center hover:underline">Admin</Link>}
              {roles.includes("developer") && <Link href="/dev" className="inline-flex min-h-[40px] items-center hover:underline">Dev</Link>}
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="inline-flex min-h-[40px] items-center hover:underline">Sign in</Link>
              <Link href="/register" className="btn min-h-[36px] px-3">Create account</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
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
