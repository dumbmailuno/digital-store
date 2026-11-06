import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/admin/product-form";
import { ProductMedia } from "@/components/admin/product-media";

export const metadata: Metadata = { title: "Edit product" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditProduct({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound();
  const supabase = createClient();
  const [{ data: p }, { data: cats }, { data: file }] = await Promise.all([
    supabase.from("products").select("id, public_id, name, slug, category_id, price_usd, description, status, download_limit, link_expiry_hours, product_images(id, path, position)").eq("id", params.id).maybeSingle(),
    supabase.from("categories").select("id, name, status").order("name"),
    supabase.from("product_files").select("id, path, size_bytes, version").eq("product_id", params.id).maybeSingle(),
  ]);
  if (!p) notFound();
  const prod = p as any;

  return (
    <div className="space-y-5">
      <Link href="/admin/products" className="text-sm underline">← Products</Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="page-title-sm">{prod.name}</h1>
        <p className="font-mono text-xs text-ink-mute">{prod.public_id}</p>
      </div>
      {prod.status === "active" && <Link href={`/products/${prod.slug}`} className="inline-block text-sm underline">View in store</Link>}
      <ProductForm categories={(cats ?? []) as any} initial={{
        id: prod.id, name: prod.name, slug: prod.slug, category_id: prod.category_id, price_usd: String(prod.price_usd),
        description: prod.description, status: prod.status, download_limit: prod.download_limit, link_expiry_hours: prod.link_expiry_hours,
      }} />
      <ProductMedia productId={prod.id} images={prod.product_images} file={(file as any) ?? null} published={prod.status === "active"} />
    </div>
  );
}
