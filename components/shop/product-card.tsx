import Link from "next/link";
import { publicUrl, usd } from "@/lib/storage";

export type CardProduct = { id: string; slug: string; name: string; price_usd: string; categories: { name: string } | null; product_images: { path: string; position: number }[] };

export function ProductCard({ p }: { p: CardProduct }) {
  const first = [...p.product_images].sort((a, b) => a.position - b.position)[0];
  const img = publicUrl("product-images", first?.path);
  return (
    <Link href={`/products/${p.slug}`} className="card block p-0 transition-colors hover:border-ink-mute">
      <div className="aspect-[4/3] overflow-hidden rounded-t bg-paper-dim">
        {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
             : <div className="flex h-full items-center justify-center text-xs text-ink-mute">No image</div>}
      </div>
      <div className="p-4">
        {p.categories && <p className="text-xs text-ink-mute">{p.categories.name}</p>}
        <h3 className="mt-0.5 font-medium leading-snug">{p.name}</h3>
        <p className="mt-2 text-sm font-semibold">{usd(p.price_usd)}</p>
      </div>
    </Link>
  );
}
