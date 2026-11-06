import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CategoryManager } from "@/components/admin/category-manager";

export const metadata: Metadata = { title: "Categories" };

export default async function Categories() {
  const supabase = createClient();
  const { data } = await supabase.from("categories").select("id, name, slug, status").order("name");
  return (
    <div className="space-y-5">
      <h1 className="page-title-sm">Categories</h1>
      <CategoryManager categories={(data ?? []) as any} />
    </div>
  );
}
