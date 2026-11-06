import type { Metadata } from "next";
import { Catalog } from "@/components/shop/catalog";

export const metadata: Metadata = { title: "Catalog" };
export const dynamic = "force-dynamic";

export default function Shop({ searchParams }: { searchParams: { q?: string; cat?: string; page?: string; sort?: string; view?: string } }) {
  return <Catalog searchParams={searchParams} path="/shop" />;
}
