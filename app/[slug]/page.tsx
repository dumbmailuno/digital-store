import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Legal/info pages (terms, privacy, refund-policy, shipping-policy,
// crypto-payment-policy, faq, about) are stored in the DB so the admin edits them.
const SLUGS = ["terms", "privacy", "refund-policy", "shipping-policy", "crypto-payment-policy", "faq", "about"];

export const revalidate = 300;

export default async function LegalPage({ params }: { params: { slug: string } }) {
  if (!SLUGS.includes(params.slug)) notFound();
  const supabase = createClient();
  const { data } = await supabase
    .from("legal_documents").select("title, body_md, updated_at").eq("slug", params.slug).maybeSingle();
  if (!data) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-semibold">{data.title}</h1>
      <p className="mt-1 text-xs text-ink-mute">Last updated {new Date(data.updated_at).toLocaleDateString()}</p>
      {/* plain text rendering on purpose: no raw HTML from the database */}
      <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-ink-soft">{data.body_md}</div>
    </main>
  );
}
