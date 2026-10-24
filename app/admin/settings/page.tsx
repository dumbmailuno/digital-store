import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Store settings" };

export default async function Settings() {
  const { data } = await createClient().from("store_settings").select("store_name, description, contact_email, logo_path, favicon_path, developer_support_access").maybeSingle();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Store settings</h1>
      <SettingsForm initial={(data as any) ?? { store_name: "My Store", description: null, contact_email: null, logo_path: null, favicon_path: null, developer_support_access: false }} />
    </div>
  );
}
