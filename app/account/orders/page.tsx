import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { usd } from "@/lib/storage";
import { RepurchaseButton } from "@/components/shop/repurchase-button";

export const metadata: Metadata = { title: "My orders" };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment", paid: "Paid", fulfilled: "Delivered", cancelled: "Cancelled", expired: "Expired",
};
const TONE: Record<string, string> = {
  fulfilled: "text-ok", paid: "text-ok", pending_payment: "text-warn", cancelled: "text-ink-mute", expired: "text-ink-mute",
};

export default async function Orders() {
  const supabase = createClient();
  // RLS: only this customer's orders. products is null for archived/unpublished items.
  const { data } = await supabase.from("orders")
    .select("id, public_id, status, total_usd, created_at, payments(public_id, status), order_items(id, product_id, product_name_snap, unit_price_usd, products(id, status, slug))")
    .order("created_at", { ascending: false }).limit(50);
  const orders = (data ?? []) as any[];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">My orders</h1>
        <Link href="/account" className="text-sm underline">Account</Link>
      </div>
      {orders.length === 0 ? (
        <div className="card mt-6 text-center"><p className="text-sm text-ink-soft">You haven't ordered anything yet.</p><Link href="/shop" className="btn mt-4">Browse products</Link></div>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((o) => {
            const live = (o.payments as any[]).find((p) => ["awaiting_payment", "payment_detected", "blockchain_verified", "admin_review", "approved"].includes(p.status));
            return (
              <li key={o.id} className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono text-sm">{o.public_id}</p>
                  <p className={`text-sm font-medium ${TONE[o.status]}`}>{LABEL[o.status] ?? o.status}</p>
                </div>
                <p className="mt-1 text-xs text-ink-mute">{new Date(o.created_at).toLocaleString()} · {usd(o.total_usd)}</p>
                <ul className="mt-3 divide-y divide-paper-line border-t border-paper-line">
                  {(o.order_items as any[]).map((it) => (
                    <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      {/* the snapshot, so history stays accurate even after edits or archiving */}
                      <span>{it.product_name_snap} <span className="text-ink-mute">· {usd(it.unit_price_usd)}</span></span>
                      {it.products?.status === "active"
                        ? <RepurchaseButton productId={it.product_id} name={it.product_name_snap} />
                        : <span className="text-xs text-ink-mute">No longer available</span>}
                    </li>
                  ))}
                </ul>
                {live && <Link href={`/payment/${live.public_id}`} className="btn mt-3 w-full sm:w-auto">View payment</Link>}
                {o.status === "fulfilled" && <p className="mt-3 text-xs text-ink-mute">Your download links were sent to your email.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
