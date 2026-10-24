"use client";

import { Guard } from "@/components/admin/read-only";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { SLUG_RE, slugify } from "@/lib/files";

export type ProductValues = {
  id?: string; name: string; slug: string; category_id: string | null; price_usd: string; description: string;
  status: "draft" | "active" | "archived"; download_limit: number | null; link_expiry_hours: number | null;
};
type Cat = { id: string; name: string; status: string };

const LIMITS = [{ v: "", l: "Unlimited downloads" }, { v: "1", l: "1 download" }, { v: "3", l: "3 downloads" }, { v: "5", l: "5 downloads" }, { v: "10", l: "10 downloads" }];
const EXPIRY = [{ v: "", l: "Link never expires" }, { v: "1", l: "1 hour" }, { v: "24", l: "24 hours" }, { v: "168", l: "7 days" }, { v: "720", l: "30 days" }];
const PRICE_RE = /^\d{1,7}(\.\d{1,2})?$/;

export function ProductForm({ initial, categories }: { initial: ProductValues; categories: Cat[] }) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !initial.id;
  const [v, setV] = useState({ ...initial, price_usd: String(initial.price_usd) });
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [t, setT] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const touch = (k: string) => setT((s) => ({ ...s, [k]: true }));

  const errs = useMemo(() => ({
    name: v.name.trim().length < 2 ? "Enter a product name (at least 2 characters)" : null,
    slug: !SLUG_RE.test(v.slug) ? "Use lowercase letters, numbers and single hyphens" : null,
    price: !PRICE_RE.test(v.price_usd) || Number(v.price_usd) <= 0 ? "Enter a price above 0, like 29.99" : null,
    description: v.description.length > 10000 ? "That's too long (10,000 characters max)" : null,
  }), [v]);
  const bad = Object.values(errs).some(Boolean);
  const show = (k: keyof typeof errs) => (t[k] && errs[k] ? errs[k] : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (bad) { setT({ name: true, slug: true, price: true, description: true }); toast("error", "Please fix the highlighted fields."); return; }
    setBusy(true);
    const row = {
      name: v.name.trim(), slug: v.slug, category_id: v.category_id || null, price_usd: v.price_usd,
      description: v.description, status: v.status, download_limit: v.download_limit, link_expiry_hours: v.link_expiry_hours,
    };
    const supabase = createClient();
    const res = isNew
      ? await supabase.from("products").insert({ ...row, status: "draft" }).select("id").single()
      : await supabase.from("products").update(row).eq("id", initial.id!).select("id").single();
    setBusy(false);
    if (res.error) {
      const m = res.error.message;
      toast("error",
        res.error.code === "23505" ? "Another product already uses that URL name." :
        /product_needs_file/.test(m) ? "Upload the product's ZIP file before publishing it." :
        res.error.code === "42501" || /row-level security/i.test(m) ? "Only the store admin can change products, and only while the store is active." :
        "Couldn't save the product. Please try again.");
      return;
    }
    toast("success", isNew ? "Product created. Now add images and the ZIP file." : "Product saved");
    if (isNew) router.push(`/admin/products/${res.data!.id}`); else router.refresh();
  }

  const err = (m: string | null) => <p className="mt-1 min-h-[1.25rem] text-xs text-bad" role={m ? "alert" : undefined}>{m}</p>;

  return (
    <Guard>
    <form onSubmit={submit} noValidate className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pn" className="mb-1 block text-sm font-medium">Name</label>
          <input id="pn" className={`input ${show("name") ? "border-bad" : ""}`} value={v.name} maxLength={120}
            onChange={(e) => setV({ ...v, name: e.target.value, slug: slugTouched ? v.slug : slugify(e.target.value) })} onBlur={() => touch("name")} />
          {err(show("name"))}
        </div>
        <div>
          <label htmlFor="ps" className="mb-1 block text-sm font-medium">URL name</label>
          <input id="ps" className={`input font-mono ${show("slug") ? "border-bad" : ""}`} value={v.slug} maxLength={80}
            onChange={(e) => { setSlugTouched(true); setV({ ...v, slug: e.target.value.toLowerCase() }); }} onBlur={() => touch("slug")} />
          {err(show("slug"))}
        </div>
        <div>
          <label htmlFor="pp" className="mb-1 block text-sm font-medium">Price (USD)</label>
          <input id="pp" inputMode="decimal" className={`input ${show("price") ? "border-bad" : ""}`} value={v.price_usd}
            onChange={(e) => setV({ ...v, price_usd: e.target.value.trim() })} onBlur={() => touch("price")} />
          {err(show("price"))}
        </div>
        <div>
          <label htmlFor="pc" className="mb-1 block text-sm font-medium">Category</label>
          <select id="pc" className="input" value={v.category_id ?? ""} onChange={(e) => setV({ ...v, category_id: e.target.value || null })}>
            <option value="">No category</option>
            {categories.filter((c) => c.status === "active" || c.id === v.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== "active" ? " (archived)" : ""}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pl" className="mb-1 block text-sm font-medium">Downloads allowed</label>
          <select id="pl" className="input" value={v.download_limit ?? ""} onChange={(e) => setV({ ...v, download_limit: e.target.value ? Number(e.target.value) : null })}>
            {LIMITS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="pe" className="mb-1 block text-sm font-medium">Download link lasts</label>
          <select id="pe" className="input" value={v.link_expiry_hours ?? ""} onChange={(e) => setV({ ...v, link_expiry_hours: e.target.value ? Number(e.target.value) : null })}>
            {EXPIRY.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="pd" className="mb-1 block text-sm font-medium">Description</label>
        <textarea id="pd" rows={8} className="input py-2" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} onBlur={() => touch("description")} />
        {err(show("description"))}
      </div>

      {!isNew && (
        <div>
          <label htmlFor="pst" className="mb-1 block text-sm font-medium">Status</label>
          <select id="pst" className="input sm:max-w-xs" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as ProductValues["status"] })}>
            <option value="draft">Draft (hidden)</option>
            <option value="active">Published (on sale)</option>
            <option value="archived">Archived (hidden, kept in order history)</option>
          </select>
          <p className="mt-1 text-xs text-ink-mute">A product can only be published once its ZIP file is uploaded. Products are archived, never deleted, so past orders stay intact.</p>
        </div>
      )}
      <button className="btn" disabled={busy}>{busy ? "Saving…" : isNew ? "Create product" : "Save changes"}</button>
    </form>
    </Guard>
  );
}
