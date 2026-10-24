import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LegalEditor } from "@/components/admin/legal-editor";

export const metadata: Metadata = { title: "Legal pages" };
const ORDER = ["terms", "privacy", "refund-policy", "shipping-policy", "crypto-payment-policy", "faq", "about"];

export default async function Legal() {
  const { data } = await createClient().from("legal_documents").select("slug, title, body_md, updated_at");
  const docs = ((data ?? []) as any[]).sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Legal pages</h1>
      <LegalEditor key={docs.map((d) => d.updated_at ?? d.title).join("|")} docs={docs} />
    </div>
  );
}
