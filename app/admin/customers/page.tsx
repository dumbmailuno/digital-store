import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Pager } from "@/components/admin/pager";
import { publicUrl, usd } from "@/lib/storage";
import { when } from "@/lib/labels";

export const metadata: Metadata = { title: "Customers" };
const PAGE = 25;

export default async function Customers({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const q = (searchParams.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Math.min(500, parseInt(searchParams.page ?? "1", 10) || 1));
  const supabase = createClient();
  const { data } = await supabase.rpc("admin_customers", { p_search: q || null, p_limit: PAGE, p_offset: (page - 1) * PAGE });
  const rows = (data ?? []) as any[];
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <div className="space-y-5">
      <h1 className="page-title-sm">Customers <span className="text-base font-normal text-ink-mute">({total})</span></h1>
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={q} placeholder="Search name, email or ID" aria-label="Search customers" className="input sm:max-w-sm" maxLength={60} />
        <button className="btn">Search</button>
        {q && <Link href="/admin/customers" className="btn btn-ghost">Clear</Link>}
      </form>

      {rows.length === 0 ? <div className="card text-sm text-ink-soft">No customers found.</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-paper-dim text-xs text-ink-soft"><tr>
              <th className="px-4 py-2 font-medium">Customer</th><th className="px-4 py-2 font-medium">ID</th>
              <th className="px-4 py-2 font-medium">Joined</th><th className="px-4 py-2 text-right font-medium">Paid orders</th>
              <th className="px-4 py-2 text-right font-medium">Total spent</th><th className="px-4 py-2 font-medium">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-paper-line">
                  <td className="px-4 py-2.5"><div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-paper-line bg-paper-dim">
                      {c.avatar_path ? <img src={publicUrl("avatar-assets", c.avatar_path)!} alt="" className="h-full w-full" /> : <span className="text-xs text-ink-mute">{String(c.full_name).slice(0, 1).toUpperCase()}</span>}
                    </span>
                    <span className="min-w-0"><span className="block truncate font-medium">{c.full_name}</span><span className="block truncate text-xs text-ink-soft">{c.email}</span></span>
                  </div></td>
                  <td className="px-4 py-2.5 font-mono text-xs">{c.public_id}</td>
                  <td className="px-4 py-2.5 text-xs">{when(c.created_at)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.orders_paid}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{usd(c.total_spent)}</td>
                  <td className={`px-4 py-2.5 text-xs ${c.is_active ? "text-ok" : "text-bad"}`}>{c.is_active ? "Active" : "Disabled"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/admin/customers" params={{ q: q || undefined }} page={page} pages={Math.max(1, Math.ceil(total / PAGE))} />
    </div>
  );
}
