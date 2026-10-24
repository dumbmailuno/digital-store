import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AvatarManager } from "@/components/admin/avatar-manager";
import { publicUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Avatars" };
export const dynamic = "force-dynamic";

export default async function Avatars() {
  const { data } = await createClient().from("avatar_assets").select("id, name, svg_path, status").order("created_at", { ascending: false });
  const items = (data ?? []).map((a: any) => ({ id: a.id as string, name: a.name as string, status: a.status as string, url: publicUrl("avatar-assets", a.svg_path)!, path: a.svg_path as string }));
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Avatars</h1>
        <p className="mt-1 text-sm text-ink-soft">Customers choose their profile picture from this set, and only after they verify their email. Upload simple SVG drawings.</p>
      </div>
      <AvatarManager items={items} />
    </div>
  );
}
