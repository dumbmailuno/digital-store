import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ColumnChart, type Pt } from "@/components/charts/column-chart";
import { BarList, type BarRow } from "@/components/charts/bar-list";
import { ORDER_LABEL, PAYMENT_LABEL, TONE, shortDay, when } from "@/lib/labels";
import { usd } from "@/lib/storage";

export const metadata: Metadata = { title: "Dashboard" };

const RANGES = [7, 30, 90] as const;

function Tile({ label, value, href, hint }: { label: string; value: string; href?: string; hint?: string }) {
  const body = (
    <div className="card h-full p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-mute">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block rounded transition-colors hover:bg-paper-dim">{body}</Link> : body;
}

export default async function AdminDashboard({ searchParams }: { searchParams: { days?: string } }) {
  const days = (RANGES as readonly number[]).includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const supabase = createClient();

  const [ov, rev, grow, top, act, orders, custs] = await Promise.all([
    supabase.rpc("admin_overview"),
    supabase.rpc("admin_revenue_series", { p_days: days }),
    supabase.rpc("admin_customer_growth", { p_days: days }),
    supabase.rpc("admin_top_products", { p_limit: 5 }),
    supabase.rpc("admin_payment_activity"),
    supabase.from("orders").select("public_id, status, total_usd, created_at, profiles(full_name)").order("created_at", { ascending: false }).limit(5),
    supabase.rpc("admin_customers", { p_search: null, p_limit: 5, p_offset: 0 }),
  ]);

  const o = (ov.data ?? {}) as Record<string, number | string>;
  const revenue = ((rev.data ?? []) as any[]);
  const growth = ((grow.data ?? []) as any[]);
  const revPts: Pt[] = revenue.map((r) => ({ key: r.day, label: shortDay(r.day), value: Number(r.revenue) }));
  const ordPts: Pt[] = revenue.map((r) => ({ key: r.day, label: shortDay(r.day), value: Number(r.orders) }));
  const gPts: Pt[] = growth.map((r) => ({ key: r.day, label: shortDay(r.day), value: Number(r.signups) }));

  const periodRevenue = revPts.reduce((s, p) => s + p.value, 0);
  const periodOrders = ordPts.reduce((s, p) => s + p.value, 0);
  const periodSignups = gPts.reduce((s, p) => s + p.value, 0);

  const topRows: BarRow[] = ((top.data ?? []) as any[]).map((t) => ({
    key: t.product_id, label: t.name, value: Number(t.revenue), display: usd(t.revenue), sub: `${t.units} sold`,
  }));
  const actRows: BarRow[] = ((act.data ?? []) as any[]).map((a) => ({
    key: a.status, label: PAYMENT_LABEL[a.status] ?? a.status, value: Number(a.n), display: String(a.n),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {/* one filter row above the charts; scopes everything below it */}
        <nav aria-label="Date range" className="flex gap-1 text-sm">
          {RANGES.map((r) => (
            <Link key={r} href={`/admin?days=${r}`} aria-current={r === days ? "true" : undefined}
              className={`rounded border px-3 py-1.5 ${r === days ? "border-accent bg-accent text-white" : "border-paper-line bg-paper hover:bg-paper-dim"}`}>
              {r} days
            </Link>
          ))}
        </nav>
      </div>

      <section aria-label="Key figures" className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
        <div className="card flex flex-col justify-center">
          <p className="text-sm text-ink-soft">Revenue, last {days} days</p>
          <p className="mt-1 text-5xl font-semibold leading-tight tracking-tight">{usd(periodRevenue)}</p>
          <p className="mt-1 text-xs text-ink-mute">All time {usd(Number(o.revenue_total ?? 0))}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label={`Paid orders (${days}d)`} value={String(periodOrders)} />
          <Tile label={`New customers (${days}d)`} value={String(periodSignups)} />
          <Tile label="Customers" value={String(o.customers ?? 0)} href="/admin/customers" />
          <Tile label="Needs review" value={String(o.pending_review ?? 0)} href="/admin/payments?filter=review" hint="payments awaiting you" />
          <Tile label="Awaiting payment" value={String(o.awaiting_payment ?? 0)} hint="open quotes" />
          <Tile label="Active products" value={String(o.products_active ?? 0)} href="/admin/products" />
        </div>
      </section>

      <section aria-label="Charts" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ColumnChart title="Revenue per day" subtitle={`Last ${days} days (UTC)`} data={revPts} kind="usd" />
        <ColumnChart title="Paid orders per day" subtitle={`Last ${days} days (UTC)`} data={ordPts} kind="count" />
        <ColumnChart title="New customers per day" subtitle={`Last ${days} days (UTC)`} data={gPts} kind="count" />
        <BarList title="Top products" subtitle="By revenue, all time" rows={topRows} empty="No sales yet." />
        <BarList title="Payment activity" subtitle="Payments by status, all time" rows={actRows} empty="No payments yet." />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card min-w-0 p-0">
          <div className="flex items-center justify-between border-b border-paper-line px-4 py-3"><h2 className="text-sm font-semibold">Recent orders</h2><Link href="/admin/orders" className="inline-block py-2 text-xs underline">All orders</Link></div>
          {((orders.data ?? []) as any[]).length === 0 ? <p className="p-4 text-sm text-ink-soft">No orders yet.</p> : (
            <ul className="divide-y divide-paper-line">
              {((orders.data ?? []) as any[]).map((r) => (
                <li key={r.public_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span><span className="font-mono text-xs">{r.public_id}</span><span className="ml-2 text-ink-soft">{r.profiles?.full_name}</span></span>
                  <span className="flex items-center gap-3"><span className={`text-xs ${TONE[r.status]}`}>{ORDER_LABEL[r.status] ?? r.status}</span><span className="font-medium">{usd(r.total_usd)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-0">
          <div className="flex items-center justify-between border-b border-paper-line px-4 py-3"><h2 className="text-sm font-semibold">Recent customers</h2><Link href="/admin/customers" className="inline-block py-2 text-xs underline">All customers</Link></div>
          {((custs.data ?? []) as any[]).length === 0 ? <p className="p-4 text-sm text-ink-soft">No customers yet.</p> : (
            <ul className="divide-y divide-paper-line">
              {((custs.data ?? []) as any[]).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate">{c.full_name}</span><span className="block truncate text-xs text-ink-soft">{c.email}</span></span>
                  <span className="text-xs text-ink-mute">{when(c.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
