"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { useCartProducts } from "@/components/shop/use-cart-products";
import { usd } from "@/lib/storage";

export default function CartPage() {
  const { remove } = useCart();
  const { products, missing, total, loading } = useCartProducts();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Your cart</h1>
      {loading ? <p className="mt-6 text-sm text-ink-soft">Loading…</p> : (
        <>
          {missing.length > 0 && (
            <div className="mt-4 rounded border border-warn/40 bg-paper p-3 text-sm">
              {missing.length} item{missing.length > 1 ? "s are" : " is"} no longer available.{" "}
              <button className="underline" onClick={() => missing.forEach(remove)}>Remove {missing.length > 1 ? "them" : "it"}</button>
            </div>
          )}
          {products.length === 0 ? (
            <div className="card mt-6 text-center">
              <p className="text-sm text-ink-soft">Your cart is empty.</p>
              <Link href="/shop" className="btn mt-4">Browse products</Link>
            </div>
          ) : (
            <>
              <ul className="card mt-6 divide-y divide-paper-line p-0">
                {products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-4 p-4">
                    <Link href={`/products/${p.slug}`} className="font-medium hover:underline">{p.name}</Link>
                    <div className="flex items-center gap-4">
                      <span className="text-sm">{usd(p.price_usd)}</span>
                      <button className="text-sm text-ink-mute hover:text-bad" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-lg font-semibold">Total {usd(total)}</p>
                <Link href="/checkout" className="btn">Checkout</Link>
              </div>
              <p className="mt-2 text-xs text-ink-mute">Digital products. All sales are final. Final price is confirmed at checkout.</p>
            </>
          )}
        </>
      )}
    </main>
  );
}
