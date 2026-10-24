"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useCartProducts } from "@/components/shop/use-cart-products";
import { useToast } from "@/components/ui/toast";
import { usd } from "@/lib/storage";
import { NETWORK_LABEL } from "@/lib/crypto/chains";

type Method = { id: string; asset: string; network: string; label: string | null };

export default function Checkout() {
  const router = useRouter();
  const toast = useToast();
  const { clear } = useCart();
  const { products, total, loading } = useCartProducts();
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [walletId, setWalletId] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/payment-methods").then(async (r) => {
      if (r.status === 401 || r.status === 403) { router.push("/login?next=/checkout"); return; }
      const j = await r.json().catch(() => ({}));
      setMethods(j.methods ?? []);
    }).catch(() => setMethods([]));
  }, [router]);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong. Please try again.");
    return json;
  }

  async function pay() {
    if (busy || !walletId || !agree || products.length === 0) return;
    setBusy(true);
    try {
      const order = await post("/api/checkout", { productIds: products.map((p) => p.id) });
      const quote = await post("/api/payments", { orderId: order.orderId, walletId });
      clear();
      router.push(`/payment/${quote.paymentId}`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Checkout failed.");
      setBusy(false);
    }
  }

  if (loading || methods === null) return <main className="mx-auto max-w-3xl px-4 py-8 text-sm text-ink-soft">Loading…</main>;
  if (products.length === 0) return (
    <main className="mx-auto max-w-3xl px-4 py-8"><div className="card text-center"><p className="text-sm text-ink-soft">Nothing to check out.</p><Link href="/shop" className="btn mt-4">Browse products</Link></div></main>
  );

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-4 py-8 md:grid-cols-5">
      <section className="space-y-4 md:col-span-3">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Pay with</h2>
          {methods.length === 0 ? <p className="text-sm text-ink-soft">No payment methods are available right now. Please try again later.</p> : (
            <fieldset className="space-y-2">
              <legend className="sr-only">Payment method</legend>
              {methods.map((m) => (
                <label key={m.id} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded border px-3 py-2 text-sm ${walletId === m.id ? "border-accent" : "border-paper-line"}`}>
                  <input type="radio" name="method" value={m.id} checked={walletId === m.id} onChange={() => setWalletId(m.id)} />
                  <span className="font-medium">{m.asset}</span>
                  <span className="text-ink-mute">on {NETWORK_LABEL[m.network] ?? m.network}</span>
                </label>
              ))}
            </fieldset>
          )}
          <p className="mt-3 text-xs text-ink-mute">The exact crypto amount is calculated when you continue and the price is locked for one hour.</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I understand crypto payments are irreversible and that all sales are final. See the <Link href="/crypto-payment-policy" className="underline">Crypto Payment Policy</Link>.</span>
        </label>
      </section>

      <aside className="md:col-span-2">
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Order summary</h2>
          <ul className="space-y-2 text-sm">
            {products.map((p) => <li key={p.id} className="flex justify-between gap-3"><span>{p.name}</span><span>{usd(p.price_usd)}</span></li>)}
          </ul>
          <p className="mt-4 flex justify-between border-t border-paper-line pt-3 font-semibold"><span>Total</span><span>{usd(total)}</span></p>
          <button className="btn mt-4 w-full" disabled={busy || !walletId || !agree} onClick={pay}>{busy ? "Preparing payment…" : "Continue to payment"}</button>
        </div>
      </aside>
    </main>
  );
}
