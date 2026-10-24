/** Public URL of an object in a PUBLIC bucket (product-images, avatar-assets, store-assets). */
export function publicUrl(bucket: "product-images" | "avatar-assets" | "store-assets", path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export const usd = (v: string | number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
