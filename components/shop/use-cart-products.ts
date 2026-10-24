"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/lib/cart";

export type CartProduct = { id: string; slug: string; name: string; price_usd: string };

/** Loads live product data for the IDs in the cart (RLS only returns ACTIVE products). */
export function useCartProducts() {
  const { ids, ready } = useCart();
  const [products, setProducts] = useState<CartProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (ids.length === 0) { setProducts([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    createClient().from("products").select("id, slug, name, price_usd").in("id", ids).then(({ data }) => {
      if (cancelled) return;
      setProducts((data ?? []) as CartProduct[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [ids, ready]);

  const available = new Set(products.map((p) => p.id));
  const missing = ids.filter((id) => !available.has(id));
  const total = products.reduce((s, p) => s + Number(p.price_usd), 0);
  return { products, missing, total, loading: loading || !ready };
}
