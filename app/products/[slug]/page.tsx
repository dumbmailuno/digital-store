import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddToCart } from "@/components/shop/add-to-cart";
import { publicUrl, usd } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const supabase = createClient();
  // RLS returns the row only if it is ACTIVE (staff can also preview drafts)
  const { data } = await supabase.from("products")
    .select("id, slug, name, description, price_usd, status, download_limit, link_expiry_hours, categories(name), product_images(path, position)")
    .eq("slug", slug).maybeSingle();
  return data as any;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await load(params.slug);
  return { title: p?.name ?? "Product" };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const p = await load(params.slug);
  if (!p) notFound();
  const imgs = [...p.product_images].sort((a: any, b: any) => a.position - b.position);

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-2">
      <div>
        <div className="aspect-[4/3] overflow-hidden rounded border border-paper-line bg-paper">
          {imgs[0] ? <img src={publicUrl("product-images", imgs[0].path)!} alt={p.name} className="h-full w-full object-cover" />
                   : <div className="flex h-full items-center justify-center text-sm text-ink-mute">No image</div>}
        </div>
        {imgs.length > 1 && (
          <ul className="mt-3 grid grid-cols-4 gap-2">
            {imgs.slice(1, 5).map((i: any) => (
              <li key={i.path} className="aspect-square overflow-hidden rounded border border-paper-line">
                <img src={publicUrl("product-images", i.path)!} alt="" loading="lazy" className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        {p.status !== "active" && <p className="mb-2 rounded border border-warn/40 bg-paper px-3 py-1.5 text-xs text-warn">Preview: this product is not published.</p>}
        {p.categories && <p className="text-sm text-ink-mute">{p.categories.name}</p>}
        <h1 className="mt-1 text-2xl font-semibold">{p.name}</h1>
        <p className="mt-3 text-2xl font-semibold">{usd(p.price_usd)}</p>
        <div className="mt-4"><AddToCart productId={p.id} name={p.name} /></div>
        <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-ink-soft">{p.description}</div>
        <dl className="mt-6 space-y-1 border-t border-paper-line pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-ink-mute">Format</dt><dd>Digital download (ZIP)</dd></div>
          <div className="flex justify-between"><dt className="text-ink-mute">Downloads</dt><dd>{p.download_limit ? `${p.download_limit} per purchase` : "Unlimited"}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-mute">Link validity</dt><dd>{p.link_expiry_hours ? `${p.link_expiry_hours} hours` : "No expiry"}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-mute">Refunds</dt><dd>All sales final</dd></div>
        </dl>
      </div>
    </main>
  );
}
