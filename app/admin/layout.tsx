import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionNav, type NavItem } from "@/components/admin/nav";
import { ReadOnlyProvider } from "@/components/admin/read-only";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  // defence in depth: middleware already gates /admin, and RLS gates the data
  // is_staff = the admin, or the developer while the admin has switched on read-only support access
  const [{ data: isStaff }, { data: isAdmin }] = await Promise.all([supabase.rpc("is_staff"), supabase.rpc("is_admin")]);
  if (isStaff !== true) notFound();
  const readOnly = isAdmin !== true;

  const [{ data: notice }, { count: review }] = await Promise.all([
    supabase.rpc("store_notice"),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "admin_review"),
  ]);

  const items: NavItem[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/payments", label: "Payments", badge: review ?? 0 },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/products", label: "Products" },
    { href: "/admin/categories", label: "Categories" },
    { href: "/admin/avatars", label: "Avatars" },
    { href: "/admin/customers", label: "Customers" },
    { href: "/admin/wallets", label: "Wallets" },
    { href: "/admin/settings", label: "Store settings" },
    { href: "/admin/legal", label: "Legal pages" },
    { href: "/admin/audit-log", label: "Audit log" },
  ];

  const n = notice as { days_left: number; maintenance_forced: boolean; status: string } | null;
  const warn = !readOnly && n && (n.maintenance_forced || n.status !== "active" || n.days_left <= 7);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {readOnly && (
        <div role="status" className="mb-5 rounded border border-accent/40 bg-paper px-4 py-3 text-sm">
          <b>Read-only support view.</b> You're looking at the store as the developer. The store admin switched this on and can switch it off in Store settings. Nothing here can be changed.
        </div>
      )}
      {warn && n && (
        <div role="alert" className="mb-5 rounded border border-warn/40 bg-paper px-4 py-3 text-sm">
          {n.maintenance_forced || n.status !== "active"
            ? <>The store is in <b>{n.maintenance_forced ? "maintenance" : n.status}</b> mode. Contact your developer.</>
            : n.days_left > 0
              ? <>Your service subscription ends in <b>{n.days_left} day{n.days_left === 1 ? "" : "s"}</b>. Contact your developer to renew so the store stays online.</>
              : <>Your service subscription has ended and the store will go offline when the grace period finishes. Contact your developer now.</>}
        </div>
      )}
      <div className="md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
        <SectionNav items={items} label="Admin" />
        <div className="min-w-0"><ReadOnlyProvider value={readOnly}>{children}</ReadOnlyProvider></div>
      </div>
    </div>
  );
}
