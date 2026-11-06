import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Pager } from "@/components/admin/pager";
import { ORDER_LABEL, PAYMENT_LABEL, TONE, when } from "@/lib/labels";
import { usd } from "@/lib/storage";
import { likePattern } from "@/lib/search";

export const metadata: Metadata = { title: "Orders" };
const PAGE = 20;
const STATUSES = ["pending_payment", "paid", "fulfilled", "cancelled", "expired"];

export default async function Orders({ searchParams }: { searchParams: { status?: string; q?: string; page?: string } }) {
  const status = STATUSES.includes(searchParams.status ?? "") ? searchParams.status! : undefined;
  const q = (searchParams.q ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 30).toUpperCase();
  const page = Math.max(1, Math.min(500, parseInt(searchParams.page ?? "1", 10) || 1));
  const supabase = createClient();

  let query = supabase.from("orders").select(
    "id, public_id, status, total_usd, created_at, profiles(full_name, email), order_items(id, product_name_snap, unit_price_usd), payments(public_id, status, asset, network)",
    { count: "exact" },
  ).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (status) query = query.eq("status", status);
  const like = likePattern(q);
  if (like) query = query.ilike("public_id", like);
  const { data, count } = await query;
  const rows = (data ?? []) as any[];

  return (
    <div className="space-y-5">
      <h1 className="page-title-sm">Orders</h1>
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={q} placeholder="Order ID, e.g. ORD-20261021" aria-label="Search by order ID" className="input sm:max-w-xs" maxLength={30} />
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className="input sm:max-w-[200px]">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{ORDER_LABEL[s]}</option>)}
        </select>
        <button className="btn">Filter</button>
        {(q || status) && <Link href="/admin/orders" className="btn btn-ghost">Clear</Link>}
      </form>

      {rows.length === 0 ? <div className="card text-sm text-ink-soft">No orders match.</div> : (
        <ul className="space-y-3">
          {rows.map((o) => (
            <li key={o.id} className="card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-sm">{o.public_id}</p>
                <p className={`text-sm font-medium ${TONE[o.status]}`}>{ORDER_LABEL[o.status] ?? o.status}</p>
              </div>
              <p className="mt-1 text-sm">{o.profiles?.full_name} <span className="text-ink-soft">({o.profiles?.email})</span></p>
              <p className="text-xs text-ink-mute">{when(o.created_at)} · {usd(o.total_usd)}</p>
              <ul className="mt-2 divide-y divide-paper-line border-t border-paper-line text-sm">
                {o.order_items.map((i: any) => <li key={i.id} className="flex justify-between gap-3 py-1.5"><span>{i.product_name_snap}</span><span>{usd(i.unit_price_usd)}</span></li>)}
              </ul>
              {o.payments.length > 0 && (
                <p className="mt-2 text-xs text-ink-soft">Payments: {o.payments.map((p: any) => `${p.public_id} (${p.asset}/${p.network}, ${PAYMENT_LABEL[p.status] ?? p.status})`).join(" · ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/admin/orders" params={{ status, q: q || undefined }} page={page} pages={Math.max(1, Math.ceil((count ?? 0) / PAGE))} />
    </div>
  );
}
