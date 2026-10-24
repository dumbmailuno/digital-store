"use client";

import { Guard } from "@/components/admin/read-only";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { SLUG_RE, slugify } from "@/lib/files";

type Cat = { id: string; name: string; slug: string; status: "active" | "archived" | "draft" };

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [eName, setEName] = useState("");

  const nameErr = name.trim().length > 0 && name.trim().length < 2 ? "At least 2 characters" : null;
  const slugErr = slug && !SLUG_RE.test(slug) ? "Use lowercase letters, numbers and single hyphens" : null;
  const canAdd = name.trim().length >= 2 && !!slug && !slugErr;

  const explain = (code?: string) => code === "23505" ? "That URL name is already used by another category." : code === "42501" ? "Only the store admin can change categories." : "Couldn't save. Please try again.";

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd || busy) return;
    setBusy(true);
    const { error } = await createClient().from("categories").insert({ name: name.trim(), slug });
    setBusy(false);
    if (error) { toast("error", explain(error.code)); return; }
    toast("success", "Category added"); setName(""); setSlug(""); setSlugTouched(false); router.refresh();
  }

  async function save(c: Cat) {
    if (eName.trim().length < 2) { toast("error", "Name must be at least 2 characters."); return; }
    const { error } = await createClient().from("categories").update({ name: eName.trim() }).eq("id", c.id);
    if (error) { toast("error", explain(error.code)); return; }
    toast("success", "Category renamed"); setEditing(null); router.refresh();
  }

  async function setStatus(c: Cat, status: "active" | "archived") {
    const { error } = await createClient().from("categories").update({ status }).eq("id", c.id);
    if (error) { toast("error", explain(error.code)); return; }
    toast("success", status === "archived" ? "Category archived. Its products stay available." : "Category restored"); router.refresh();
  }

  return (
    <Guard>
    <div className="space-y-6">
      <form onSubmit={add} noValidate className="card space-y-3">
        <h2 className="text-sm font-semibold">Add a category</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cn" className="mb-1 block text-sm font-medium">Name</label>
            <input id="cn" className={`input ${nameErr ? "border-bad" : ""}`} value={name} maxLength={60}
              onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
            <p className="mt-1 min-h-[1.25rem] text-xs text-bad">{nameErr}</p>
          </div>
          <div>
            <label htmlFor="cs" className="mb-1 block text-sm font-medium">URL name</label>
            <input id="cs" className={`input font-mono ${slugErr ? "border-bad" : ""}`} value={slug} maxLength={60}
              onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugTouched(true); }} />
            <p className="mt-1 min-h-[1.25rem] text-xs text-bad">{slugErr}</p>
          </div>
        </div>
        <button className="btn" disabled={!canAdd || busy}>{busy ? "Adding…" : "Add category"}</button>
      </form>

      {categories.length === 0 ? <div className="card text-sm text-ink-soft">No categories yet.</div> : (
        <ul className="card divide-y divide-paper-line p-0">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              {editing === c.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <input aria-label="Category name" className="input max-w-xs" value={eName} maxLength={60} onChange={(e) => setEName(e.target.value)} autoFocus />
                  <button className="btn min-h-[36px] px-3" onClick={() => save(c)}>Save</button>
                  <button className="btn btn-ghost min-h-[36px] px-3" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div><p className={`text-sm font-medium ${c.status === "archived" ? "text-ink-mute line-through" : ""}`}>{c.name}</p><p className="font-mono text-xs text-ink-mute">{c.slug}</p></div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${c.status === "active" ? "text-ok" : "text-ink-mute"}`}>{c.status === "active" ? "Active" : "Archived"}</span>
                    <button className="btn btn-ghost min-h-[36px] px-3" onClick={() => { setEditing(c.id); setEName(c.name); }}>Rename</button>
                    <button className="btn btn-ghost min-h-[36px] px-3" onClick={() => setStatus(c, c.status === "active" ? "archived" : "active")}>{c.status === "active" ? "Archive" : "Restore"}</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
    </Guard>
  );
}
