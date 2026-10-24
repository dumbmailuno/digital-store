import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type CardProduct } from "@/components/shop/product-card";

export const revalidate = 60;

export default async function Home() {
  const supabase = createClient();
  const [{ data: store }, { data: products }] = await Promise.all([
    supabase.from("store_settings").select("store_name, description").maybeSingle(),
    supabase.from("products").select("id, slug, name, price_usd, categories(name), product_images(path, position)")
      .eq("status", "active").order("created_at", { ascending: false }).limit(8),
  ]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">{store?.store_name ?? "Store"}</h1>
        {store?.description && <p className="mt-3 text-ink-soft">{store.description}</p>}
        <Link href="/shop" className="btn mt-6">Browse products</Link>
      </section>
      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold">Latest</h2>
        {products?.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(products as unknown as CardProduct[]).map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        ) : <p className="text-sm text-ink-soft">Products are coming soon.</p>}
      </section>
    </main>
  );
}
