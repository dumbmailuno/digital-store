"use client";

import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useToast } from "@/components/ui/toast";

export function RepurchaseButton({ productId, name }: { productId: string; name: string }) {
  const { add } = useCart();
  const toast = useToast();
  const router = useRouter();
  return (
    <button className="btn btn-ghost min-h-[36px] px-3" onClick={() => { add(productId); toast("success", `${name} added to cart`); router.push("/cart"); }}>
      Buy again
    </button>
  );
}
