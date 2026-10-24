"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Digital goods: one licence per product, so the cart is just a set of product IDs.
// It only ever holds IDs. Prices and availability are re-read from the database
// at display time and decided again by the server at checkout.
const KEY = "cart:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Cart = { ids: string[]; ready: boolean; add: (id: string) => void; remove: (id: string) => void; clear: () => void; has: (id: string) => boolean };
const Ctx = createContext<Cart | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(raw)) setIds([...new Set(raw.filter((x) => typeof x === "string" && UUID.test(x)))].slice(0, 20));
    } catch { /* storage blocked or corrupt: start empty */ }
    setReady(true);
  }, []);

  const persist = useCallback((next: string[]) => {
    setIds(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const value = useMemo<Cart>(() => ({
    ids, ready,
    add: (id) => persist(ids.includes(id) || ids.length >= 20 ? ids : [...ids, id]),
    remove: (id) => persist(ids.filter((x) => x !== id)),
    clear: () => persist([]),
    has: (id) => ids.includes(id),
  }), [ids, ready, persist]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside <CartProvider>");
  return c;
}
