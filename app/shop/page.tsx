import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type CardProduct } from "@/components/shop/product-card";
import { likePattern } from "@/lib/search";

export const metadata: Metadata = { title: "Shop" };
export const dynamic = "force-dynamic";

const PAGE = 12;

export default async function Shop({ searchParams }: { searchParams: { q?: string; cat?: string; page?: string } }) {
  const supabase = createClient();
  // strip characters that have meaning inside a PostgREST filter string
  const q = (searchParams.q ?? "").replace(/[^\p{L}\p{N} \-]/gu, "").trim().slice(0, 60);
  const page = Math.max(1, Math.min(500, parseInt(searchParams.page ?? "1", 10) || 1));

  const { data: cats } = await supabase.from("categories").select("slug, name").eq("status", "active").order("name");
  const cat = cats?.find((c) => c.slug === searchParams.cat);

  let query = supabase.from("products")
    .select("id, slug, name, price_usd, categories!inner(name, slug), product_images(path, position)", { count: "exact" })
    .eq("status", "active").order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (cat) query = query.eq("categories.slug", cat.slug);
  const like = likePattern(q);
  if (like) query = query.ilike("name", like);
  const { data, count } = await query;

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q: q || undefined, cat: cat?.slug, page: undefined as string | undefined, ...over };
    Object.entries(merged).forEach(([k, v]) => v && sp.set(k, v));
    const s = sp.toString();
    return s ? `/shop?${s}` : "/shop";
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Shop</h1>
      <form action="/shop" className="mt-4 flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={q} placeholder="Search products" aria-label="Search products" className="input sm:max-w-sm" maxLength={60} />
        {cat && <input type="hidden" name="cat" value={cat.slug} />}
        <button className="btn sm:w-auto">Search</button>
      </form>

      <nav aria-label="Categories" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={href({ cat: undefined })} className={`rounded border px-3 py-1.5 ${!cat ? "border-accent bg-accent text-white" : "border-paper-line bg-paper"}`}>All</Link>
        {cats?.map((c) => (
          <Link key={c.slug} href={href({ cat: c.slug })} className={`rounded border px-3 py-1.5 ${cat?.slug === c.slug ? "border-accent bg-accent text-white" : "border-paper-line bg-paper"}`}>{c.name}</Link>
        ))}
      </nav>

      {data?.length ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(data as unknown as CardProduct[]).map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      ) : <p className="mt-10 text-sm text-ink-soft">No products match your search.</p>}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="btn btn-ghost">Previous</Link> : <span />}
          <span className="text-ink-soft">Page {page} of {pages}</span>
          {page < pages ? <Link href={href({ page: String(page + 1) })} className="btn btn-ghost">Next</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
