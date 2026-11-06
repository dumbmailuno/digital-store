"use client";

import { Guard } from "@/components/admin/read-only";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { emailSchema, fieldError } from "@/lib/validation";
import { EXT, MIME, mb, sniff } from "@/lib/files";
import { publicUrl } from "@/lib/storage";

type S = { store_name: string; description: string | null; contact_email: string | null; logo_path: string | null; favicon_path: string | null; developer_support_access: boolean };

export function SettingsForm({ initial }: { initial: S }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ store_name: initial.store_name, description: initial.description ?? "", contact_email: initial.contact_email ?? "" });
  const [logo, setLogo] = useState(initial.logo_path);
  const [support, setSupport] = useState(initial.developer_support_access);
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState<Record<string, boolean>>({});

  const errs = useMemo(() => ({
    store_name: v.store_name.trim().length < 2 ? "Enter your store name (at least 2 characters)" : null,
    contact_email: v.contact_email.trim() ? fieldError(emailSchema, v.contact_email) : null,
    description: v.description.length > 300 ? "Keep it under 300 characters" : null,
  }), [v]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (Object.values(errs).some(Boolean)) { setT({ store_name: true, contact_email: true, description: true }); toast("error", "Please fix the highlighted fields."); return; }
    setBusy(true);
    const { error } = await createClient().from("store_settings").update({
      store_name: v.store_name.trim(), description: v.description.trim() || null, contact_email: v.contact_email.trim().toLowerCase() || null, logo_path: logo, developer_support_access: support,
    }).eq("id", true);
    setBusy(false);
    if (error) { toast("error", error.code === "42501" ? "Only the store admin can change store settings." : "Couldn't save. Please try again."); return; }
    toast("success", "Store settings saved"); router.refresh();
  }

  async function uploadLogo(list: FileList | null) {
    const f = list?.[0]; if (!f) return;
    const kind = await sniff(f);
    if (kind !== "png" && kind !== "jpeg" && kind !== "webp") { toast("error", "Use a PNG, JPG or WebP logo."); return; }
    if (f.size > 2 * 1024 * 1024) { toast("error", `That logo is ${mb(f.size)}. Keep it under 2 MB.`); return; }
    const path = `logo-${crypto.randomUUID()}.${EXT[kind]}`;
    const { error } = await createClient().storage.from("store-assets").upload(path, f, { contentType: MIME[kind] });
    if (error) { toast("error", "Couldn't upload the logo."); return; }
    setLogo(path); toast("info", "Logo uploaded. Save to apply it.");
  }

  const show = (k: keyof typeof errs) => (t[k] ? errs[k] : null);
  return (
    <Guard>
    <form onSubmit={save} noValidate className="card space-y-4">
      <div>
        <label htmlFor="sn" className="mb-1 block text-sm font-medium">Store name</label>
        <input id="sn" className={`input ${show("store_name") ? "border-bad" : ""}`} value={v.store_name} maxLength={60} onChange={(e) => setV({ ...v, store_name: e.target.value })} onBlur={() => setT((s) => ({ ...s, store_name: true }))} />
        <p className="mt-1 min-h-[1.25rem] text-xs text-bad">{show("store_name")}</p>
      </div>
      <div>
        <label htmlFor="sd" className="mb-1 block text-sm font-medium">Short description</label>
        <textarea id="sd" rows={3} className="input py-2" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} onBlur={() => setT((s) => ({ ...s, description: true }))} />
        <p className="mt-1 min-h-[1.25rem] text-xs text-bad">{show("description")}</p>
      </div>
      <div>
        <label htmlFor="ce" className="mb-1 block text-sm font-medium">Contact email</label>
        <input id="ce" type="email" className={`input ${show("contact_email") ? "border-bad" : ""}`} value={v.contact_email} onChange={(e) => setV({ ...v, contact_email: e.target.value })} onBlur={() => setT((s) => ({ ...s, contact_email: true }))} />
        <p className="mt-1 min-h-[1.25rem] text-xs text-bad">{show("contact_email")}</p>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Logo</p>
        <div className="flex flex-wrap items-center gap-3">
          {logo ? <img src={publicUrl("store-assets", logo)!} alt="Current logo" className="h-12 max-w-[160px] rounded-2xl border border-paper-line bg-white object-contain p-1" /> : <span className="text-xs text-ink-mute">No logo</span>}
          <label className="btn btn-ghost min-h-[36px] cursor-pointer px-3">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { uploadLogo(e.target.files); e.target.value = ""; }} /></label>
          {logo && <button type="button" className="text-xs underline" onClick={() => setLogo(null)}>Remove</button>}
        </div>
      </div>
      <div className="rounded-2xl border border-paper-line bg-paper-dim p-3">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={support} onChange={(e) => setSupport(e.target.checked)} />
          <span>
            <b>Let my developer view this dashboard (read-only)</b>
            <span className="mt-0.5 block text-xs text-ink-soft">
              While this is on, your developer can open the admin pages and see the same orders, payments, customers and settings, so they can help find a bug. They can never change anything, and you can switch it off at any time. Leave it off when you don't need support.
            </span>
          </span>
        </label>
      </div>
      <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
    </form>
    </Guard>
  );
}
