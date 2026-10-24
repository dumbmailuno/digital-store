"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { useToast } from "@/components/ui/toast";

export function AddToCart({ productId, name }: { productId: string; name: string }) {
  const { add, has, ready } = useCart();
  const toast = useToast();
  if (ready && has(productId)) {
    return <Link href="/cart" className="btn btn-ghost w-full sm:w-auto">In your cart · View cart</Link>;
  }
  return (
    <button className="btn w-full sm:w-auto" disabled={!ready}
      onClick={() => { add(productId); toast("success", `${name} added to cart`); }}>
      Add to cart
    </button>
  );
}
