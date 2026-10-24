import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DecisionButtons } from "@/components/admin/decision-buttons";
import { Pager } from "@/components/admin/pager";
import { PAYMENT_LABEL, TONE, when } from "@/lib/labels";
import { NETWORK_LABEL, explorerUrl } from "@/lib/crypto/chains";
import { trimDecimal } from "@/lib/format";
import { usd } from "@/lib/storage";

export const metadata: Metadata = { title: "Payments" };
const PAGE = 20;

export default async function Payments({ searchParams }: { searchParams: { filter?: string; page?: string } }) {
  const filter = searchParams.filter === "all" ? "all" : "review";
  const page = Math.max(1, Math.min(500, parseInt(searchParams.page ?? "1", 10) || 1));
  const supabase = createClient();

  let q = supabase.from("payments").select(
    "id, public_id, status, asset, network, address_snap, created_at, orders(public_id, total_usd, profiles(full_name, email)), payment_quotes(amount_crypto, expires_at), blockchain_transactions(tx_hash, amount_crypto, confirmations), payment_events(id, note, created_at)",
    { count: "exact" },
  ).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (filter === "review") q = q.eq("status", "admin_review");
  const { data, count } = await q;
  const rows = (data ?? []) as any[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Payments</h1>
        <nav aria-label="Filter" className="flex gap-1 text-sm">
          {([["review", "Needs review"], ["all", "All payments"]] as const).map(([k, l]) => (
            <Link key={k} href={`/admin/payments?filter=${k}`} aria-current={k === filter ? "true" : undefined}
              className={`rounded border px-3 py-1.5 ${k === filter ? "border-accent bg-accent text-white" : "border-paper-line bg-paper hover:bg-paper-dim"}`}>{l}</Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? <div className="card text-sm text-ink-soft">{filter === "review" ? "Nothing is waiting for your review." : "No payments yet."}</div> : (
        <ul className="space-y-4">
          {rows.map((p) => {
            const quote = p.payment_quotes?.[0];
            const txs = (p.blockchain_transactions ?? []) as any[];
            const latest = [...(p.payment_events ?? [])].sort((a, b) => b.id - a.id)[0];
            return (
              <li key={p.id} className="card space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p><span className="font-mono text-sm">{p.public_id}</span> <span className="text-xs text-ink-mute">· order {p.orders?.public_id}</span></p>
                  <p className={`text-sm font-medium ${TONE[p.status]}`}>{PAYMENT_LABEL[p.status] ?? p.status}</p>
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-ink-mute">Customer</dt><dd>{p.orders?.profiles?.full_name} <span className="text-ink-soft">({p.orders?.profiles?.email})</span></dd></div>
                  <div><dt className="text-xs text-ink-mute">Order value</dt><dd>{usd(p.orders?.total_usd ?? 0)}</dd></div>
                  <div><dt className="text-xs text-ink-mute">Expected</dt><dd className="font-mono">{quote ? `${trimDecimal(quote.amount_crypto)} ${p.asset}` : "-"} <span className="font-sans text-xs text-ink-mute">on {NETWORK_LABEL[p.network] ?? p.network}</span></dd></div>
                  <div><dt className="text-xs text-ink-mute">Quote expired at</dt><dd>{quote ? when(quote.expires_at) : "-"}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-ink-mute">Pay-to address (frozen at checkout)</dt><dd className="break-all font-mono text-xs">{p.address_snap}</dd></div>
                  {txs.map((t) => {
                    const url = explorerUrl(p.network, t.tx_hash);
                    return (
                      <div key={t.tx_hash} className="sm:col-span-2">
                        <dt className="text-xs text-ink-mute">Transaction · received {trimDecimal(t.amount_crypto)} {p.asset} · {t.confirmations} confirmations</dt>
                        <dd className="break-all font-mono text-xs">{t.tx_hash} {url && <a href={url} target="_blank" rel="noopener noreferrer" className="ml-2 font-sans underline">View on explorer</a>}</dd>
                      </div>
                    );
                  })}
                </dl>
                {latest?.note && <p className="rounded border border-paper-line bg-paper-dim px-3 py-2 text-sm"><span className="text-xs text-ink-mute">Latest note: </span>{latest.note}</p>}
                {p.status === "admin_review" && <DecisionButtons paymentId={p.public_id} />}
              </li>
            );
          })}
        </ul>
      )}
      <Pager basePath="/admin/payments" params={{ filter }} page={page} pages={Math.max(1, Math.ceil((count ?? 0) / PAGE))} />
    </div>
  );
}
