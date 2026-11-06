import Link from "next/link";
import { ArrowDownWideNarrow, Grid2X2, List, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type CardProduct } from "@/components/shop/product-card";
import { likePattern } from "@/lib/search";
import { DismissibleDetails } from "@/components/ui/dismissible-details";

const PAGE = 12;
const SORTS = ["featured", "low", "high", "name"] as const;
const VIEWS = ["grid", "list"] as const;
type Sort = (typeof SORTS)[number];
type View = (typeof VIEWS)[number];

type CatalogProps = {
  searchParams: { q?: string; cat?: string; page?: string; sort?: string; view?: string };
  path: "/" | "/shop";
};

export async function Catalog({ searchParams, path }: CatalogProps) {
  const supabase = createClient();
  const [{ data: store }, { data: cats }] = await Promise.all([
    supabase.from("store_settings").select("description").maybeSingle(),
    supabase.from("categories").select("slug, name").eq("status", "active").order("name"),
  ]);
  const q = (searchParams.q ?? "").replace(/[^\p{L}\p{N} \-]/gu, "").trim().slice(0, 60);
  const page = Math.max(1, Math.min(500, parseInt(searchParams.page ?? "1", 10) || 1));
  const sort: Sort = SORTS.includes(searchParams.sort as Sort) ? searchParams.sort as Sort : "featured";
  const view: View = VIEWS.includes(searchParams.view as View) ? searchParams.view as View : "grid";
  const cat = cats?.find((category) => category.slug === searchParams.cat);

  let query = supabase.from("products")
    .select("id, slug, name, price_usd, categories!inner(name, slug), product_images(path, position)", { count: "exact" })
    .eq("status", "active");
  if (sort === "low") query = query.order("price_usd", { ascending: true });
  else if (sort === "high") query = query.order("price_usd", { ascending: false });
  else if (sort === "name") query = query.order("name", { ascending: true });
  else query = query.order("created_at", { ascending: false });
  query = query.range((page - 1) * PAGE, page * PAGE - 1);
  if (cat) query = query.eq("categories.slug", cat.slug);
  const like = likePattern(q);
  if (like) query = query.ilike("name", like);
  const { data, count } = await query;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  const href = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      q: q || undefined,
      cat: cat?.slug,
      sort: sort === "featured" ? undefined : sort,
      view: view === "grid" ? undefined : view,
      page: undefined as string | undefined,
      ...over,
    };
    Object.entries(merged).forEach(([key, value]) => value && params.set(key, value));
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-5">
        <h1 className="page-title mt-1">Catalog</h1>
        {store?.description && <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">{store.description}</p>}
      </header>

      <div className="flex items-center gap-2 sm:gap-3">
        <form action={path} className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-ink/20 px-4 focus-within:border-ink/50 sm:max-w-2xl" role="search">
          <Search size={18} className="shrink-0 text-ink-soft" aria-hidden="true" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search products..."
            aria-label="Search products"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-mute focus:ring-0"
            maxLength={60}
          />
          {cat && <input type="hidden" name="cat" value={cat.slug} />}
          {sort !== "featured" && <input type="hidden" name="sort" value={sort} />}
          {view !== "grid" && <input type="hidden" name="view" value={view} />}
          <button type="submit" className="sr-only">Search</button>
        </form>

        <div className="flex h-11 shrink-0 items-center gap-1 rounded-full border border-ink/20 p-1" role="group" aria-label="Product view">
          <Link
            href={href({ view: undefined })}
            aria-label="Grid view"
            aria-current={view === "grid" ? "page" : undefined}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${view === "grid" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper hover:text-ink"}`}
          >
            <Grid2X2 size={17} aria-hidden="true" />
          </Link>
          <Link
            href={href({ view: "list" })}
            aria-label="List view"
            aria-current={view === "list" ? "page" : undefined}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${view === "list" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper hover:text-ink"}`}
          >
            <List size={18} aria-hidden="true" />
          </Link>
        </div>

        <DismissibleDetails
          label="Sort products"
          className="group relative shrink-0"
          summaryClassName="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-ink/20 transition-colors hover:bg-paper [&::-webkit-details-marker]:hidden"
          summary={<ArrowDownWideNarrow size={17} aria-hidden="true" />}
        >
          <form action={path} className="absolute right-0 top-full z-20 mt-2 w-[min(88vw,20rem)] rounded-[28px] border border-paper-line bg-paper p-4 shadow-lg">
            {q && <input type="hidden" name="q" value={q} />}
            {cat && <input type="hidden" name="cat" value={cat.slug} />}
            {view !== "grid" && <input type="hidden" name="view" value={view} />}
            <label htmlFor="sort-products" className="mb-2 block text-xs font-medium text-ink-soft">Sort by</label>
            <select id="sort-products" name="sort" defaultValue={sort} className="input min-h-10 rounded-full px-4">
              <option value="featured">Featured</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
              <option value="name">Name: A to Z</option>
            </select>
            <button type="submit" className="btn mt-3 min-h-10 w-full">Apply</button>
          </form>
        </DismissibleDetails>
      </div>

      <nav aria-label="Product categories" className="mt-4 flex gap-2 overflow-x-auto pb-2 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link href={href({ cat: undefined })} aria-current={!cat ? "page" : undefined} className={`shrink-0 rounded-full border px-4 py-3 text-xs transition-transform active:scale-[.96] ${!cat ? "border-ink text-ink font-semibold" : "border-ink/20 text-ink-soft hover:text-ink"}`}>All</Link>
        {cats?.map((category) => (
          <Link
            key={category.slug}
            href={href({ cat: category.slug })}
            aria-current={cat?.slug === category.slug ? "page" : undefined}
            className={`shrink-0 rounded-full border px-4 py-3 text-xs transition-transform active:scale-[.96] ${cat?.slug === category.slug ? "border-ink text-ink font-semibold" : "border-ink/20 text-ink-soft hover:text-ink"}`}
          >
            {category.name}
          </Link>
        ))}
      </nav>

      {data?.length ? (
        <div className={view === "grid" ? "mt-5 grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-9 lg:grid-cols-4" : "mt-5 flex flex-col gap-4"}>
          {(data as unknown as CardProduct[]).map((product) => <ProductCard key={product.id} p={product} view={view} />)}
        </div>
      ) : (
        <p className="mt-8 rounded-[32px] border border-paper-line px-4 py-12 text-center text-sm text-ink-soft">No products match your search.</p>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="rounded-full border border-paper-line px-4 py-2 hover:bg-paper">Previous</Link> : <span />}
          <span className="text-ink-soft">Page {page} of {pages}</span>
          {page < pages ? <Link href={href({ page: String(page + 1) })} className="rounded-full border border-paper-line px-4 py-2 hover:bg-paper">Next</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
