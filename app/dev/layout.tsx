import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionNav, type NavItem } from "@/components/admin/nav";

export const dynamic = "force-dynamic";

export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: isDev } = await supabase.rpc("is_developer");
  if (isDev !== true) notFound();
  const { data: st } = await supabase.from("store_settings").select("developer_support_access").maybeSingle();
  const support = st?.developer_support_access === true;
  const items: NavItem[] = [
    { href: "/dev", label: "Overview", icon: "Gauge" },
    { href: "/dev/subscription", label: "Subscription", icon: "CreditCard" },
    { href: "/dev/flags", label: "Flags & payments", icon: "Flag" },
    { href: "/dev/audit-log", label: "Audit log", icon: "ClipboardList" },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <p className="mb-4 rounded-2xl border border-paper-line bg-paper px-4 py-2.5 text-xs text-ink-soft">Developer console. Customer and order data is not visible here. {support
        ? <>The store admin has allowed a read-only view: <Link href="/admin" className="underline">open the store dashboard</Link>.</>
        : <>For bug-hunting, ask the store admin to turn on <b>Developer view</b> in their Store settings.</>}</p>
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <SectionNav items={items} label="Developer" />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
