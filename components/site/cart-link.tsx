"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

export function CartLink() {
  const { ids, ready } = useCart();
  return (
    <Link href="/cart" className="inline-flex min-h-[40px] items-center hover:underline">
      Cart{ready && ids.length > 0 ? <span className="ml-1 rounded bg-accent px-1.5 py-0.5 text-xs text-white">{ids.length}</span> : null}
    </Link>
  );
}
