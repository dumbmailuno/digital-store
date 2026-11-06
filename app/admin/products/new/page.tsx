import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/admin/product-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewProduct() {
  const { data: cats } = await createClient().from("categories").select("id, name, status").order("name");
  return (
    <div className="space-y-5">
      <Link href="/admin/products" className="text-sm underline">← Products</Link>
      <h1 className="page-title-sm">New product</h1>
      <ProductForm categories={(cats ?? []) as any} initial={{ name: "", slug: "", category_id: null, price_usd: "", description: "", status: "draft", download_limit: 5, link_expiry_hours: 168 }} />
    </div>
  );
}
