"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { useCartProducts } from "@/components/shop/use-cart-products";
import { publicUrl, usd } from "@/lib/storage";

export default function CartPage() {
  const { remove } = useCart();
  const { products, missing, total, loading } = useCartProducts();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.045em] sm:text-4xl">Your cart</h1>
      </header>
      {loading ? <p className="mt-6 text-sm text-ink-soft">Loading…</p> : (
        <>
          {missing.length > 0 && (
            <div className="mt-4 rounded-2xl border border-warn/40 bg-paper p-4 text-sm">
              {missing.length} item{missing.length > 1 ? "s are" : " is"} no longer available.{" "}
              <button className="underline" onClick={() => missing.forEach(remove)}>Remove {missing.length > 1 ? "them" : "it"}</button>
            </div>
          )}
          {products.length === 0 ? (
            <section className="mt-8 rounded-2xl border border-paper-line px-4 py-10 text-center text-sm text-ink-soft">
              <p>Your cart is empty.</p>
              <Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-ink/20 px-4 text-xs font-medium text-ink transition-colors hover:bg-paper">
                Browse products
              </Link>
            </section>
          ) : (
            <>
              <ul className="mt-6 space-y-3">
                {products.map((p) => {
                  const first = [...p.product_images].sort((a, b) => a.position - b.position)[0];
                  const image = publicUrl("product-images", first?.path);
                  return (
                    <li key={p.id} className="flex min-w-0 items-center gap-4 rounded-[32px] border border-paper-line p-3 sm:gap-6 sm:p-4">
                      <Link href={`/products/${p.slug}`} aria-label={`View ${p.name}`} className="h-24 w-24 shrink-0 sm:h-32 sm:w-32">
                        {image ? (
                          <img src={image} alt="" className="h-full w-full object-contain drop-shadow-[0_8px_7px_rgba(0,0,0,0.12)]" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center rounded-full bg-paper-dim text-xs text-ink-mute">No image</span>
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/products/${p.slug}`} className="mt-1 line-clamp-2 font-medium leading-snug hover:underline">{p.name}</Link>
                        <p className="mt-1 text-[15px] font-bold tracking-tight">{usd(p.price_usd)}</p>
                      </div>
                      <button className="shrink-0 rounded-full px-3 py-2 text-sm text-ink-mute transition-colors hover:bg-paper-dim hover:text-bad" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex flex-col gap-4 border-t border-paper-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-lg font-semibold">Total {usd(total)}</p>
                <Link href="/checkout" className="btn w-full rounded-full sm:w-auto">Checkout</Link>
              </div>
              <p className="mt-2 text-xs text-ink-mute">Digital products. All sales are final. Final price is confirmed at checkout.</p>
            </>
          )}
        </>
      )}
    </main>
  );
}
