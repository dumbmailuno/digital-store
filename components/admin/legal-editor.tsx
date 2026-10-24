"use client";

import { Guard } from "@/components/admin/read-only";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

type Doc = { slug: string; title: string; body_md: string };

export function LegalEditor({ docs }: { docs: Doc[] }) {
  const router = useRouter();
  const toast = useToast();
  const [slug, setSlug] = useState(docs[0]?.slug ?? "");
  const current = docs.find((d) => d.slug === slug);
  const [title, setTitle] = useState(current?.title ?? "");
  const [body, setBody] = useState(current?.body_md ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = !!current && (title !== current.title || body !== current.body_md);

  function pick(next: string) {
    if (dirty && !confirm("Discard your unsaved changes?")) return;
    const d = docs.find((x) => x.slug === next)!;
    setSlug(next); setTitle(d.title); setBody(d.body_md);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || title.trim().length < 2 || body.trim().length < 5) { toast("error", "Add a title and some content first."); return; }
    setBusy(true);
    const { error } = await createClient().from("legal_documents").update({ title: title.trim(), body_md: body, updated_at: new Date().toISOString() }).eq("slug", slug);
    setBusy(false);
    if (error) { toast("error", error.code === "42501" ? "Only the store admin can edit these pages." : "Couldn't save. Please try again."); return; }
    toast("success", "Page saved"); router.refresh();
  }

  if (!current) return <div className="card text-sm text-ink-soft">No pages found.</div>;
  return (
    <Guard>
    <form onSubmit={save} noValidate className="card space-y-4">
      <div>
        <label htmlFor="ld" className="mb-1 block text-sm font-medium">Page</label>
        <select id="ld" className="input sm:max-w-sm" value={slug} onChange={(e) => pick(e.target.value)}>
          {docs.map((d) => <option key={d.slug} value={d.slug}>{d.title} (/{d.slug})</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="lt" className="mb-1 block text-sm font-medium">Title</label>
        <input id="lt" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label htmlFor="lb" className="mb-1 block text-sm font-medium">Content</label>
        <textarea id="lb" rows={20} className="input py-2 font-mono text-xs leading-6" value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="mt-1 text-xs text-ink-mute">Shown as plain text, with line breaks kept. The starter wording is a template: replace it and have it reviewed by a lawyer before you launch.</p>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy || !dirty}>{busy ? "Saving…" : "Save page"}</button>
        <a href={`/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-block py-2 text-sm underline">View page</a>
      </div>
    </form>
    </Guard>
  );
}
