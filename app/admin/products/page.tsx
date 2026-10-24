import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Pager } from "@/components/admin/pager";
import { usd } from "@/lib/storage";
import { likePattern } from "@/lib/search";

export const metadata: Metadata = { title: "Products" };
const PAGE = 25;
const STATUS = { draft: "Draft", active: "Published", archived: "Archived" } as const;
const TONE = { draft: "text-warn", active: "text-ok", archived: "text-ink-mute" } as const;

export default async function Products({ searchParams }: { searchParams: { status?: string; q?: string; page?: string } }) {
  const status = searchParams.status && searchParams.status in STATUS ? searchParams.status : undefined;
  const q = (searchParams.q ?? "").replace(/[^\p{L}\p{N} \-]/gu, "").trim().slice(0, 60);
  const page = Math.max(1, Math.min(500, parseInt(searchParams.page ?? "1", 10) || 1));
  const supabase = createClient();
  let query = supabase.from("products").select("id, name, slug, price_usd, status, categories(name), product_images(id)", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (status) query = query.eq("status", status);
  const like = likePattern(q);
  if (like) query = query.ilike("name", like);
  const { data, count } = await query;
  const rows = (data ?? []) as any[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Link href="/admin/products/new" className="btn">New product</Link>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={q} placeholder="Search products" aria-label="Search products" className="input sm:max-w-xs" maxLength={60} />
        <select name="status" defaultValue={status ?? ""} aria-label="Status" className="input sm:max-w-[180px]">
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn">Filter</button>
        {(q || status) && <Link href="/admin/products" className="btn btn-ghost">Clear</Link>}
      </form>
      {rows.length === 0 ? <div className="card text-sm text-ink-soft">No products found.</div> : (
        <ul className="card divide-y divide-paper-line p-0">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/products/${p.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-paper-dim">
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block text-xs text-ink-soft">{p.categories?.name ?? "No category"} · {p.product_images.length} image{p.product_images.length === 1 ? "" : "s"}</span></span>
                <span className="flex items-center gap-4 text-sm"><span>{usd(p.price_usd)}</span><span className={`text-xs font-medium ${TONE[p.status as keyof typeof TONE]}`}>{STATUS[p.status as keyof typeof STATUS]}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/admin/products" params={{ status, q: q || undefined }} page={page} pages={Math.max(1, Math.ceil((count ?? 0) / PAGE))} />
    </div>
  );
}
