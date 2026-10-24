"use client";

import { Guard } from "@/components/admin/read-only";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { checkSvg } from "@/lib/svg";

type Item = { id: string; name: string; status: string; url: string; path: string };

export function AvatarManager({ items }: { items: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setBusy("upload");
    const supabase = createClient();
    let ok = 0;
    for (const f of files) {
      if (f.size > 100 * 1024) { toast("error", `${f.name} is over 100 KB.`); continue; }
      const text = await f.text();
      const check = checkSvg(text);
      if (!check.ok) { toast("error", `${f.name}: ${check.reason}`); continue; }
      const name = f.name.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 40) || "Avatar";
      const path = `${crypto.randomUUID()}.svg`;
      const up = await supabase.storage.from("avatar-assets").upload(path, new Blob([text], { type: "image/svg+xml" }), { contentType: "image/svg+xml", upsert: false });
      if (up.error) { toast("error", `Couldn't upload ${f.name}.`); continue; }
      const ins = await supabase.from("avatar_assets").insert({ name, svg_path: path });
      if (ins.error) {
        await supabase.storage.from("avatar-assets").remove([path]);
        toast("error", ins.error.code === "23505" ? `You already have an avatar named "${name}". Rename the file.` : `Couldn't save ${f.name}.`);
        continue;
      }
      ok++;
    }
    setBusy(null);
    if (ok) { toast("success", ok === 1 ? "Avatar added" : `${ok} avatars added`); router.refresh(); }
  }

  async function setStatus(i: Item, status: "active" | "archived") {
    setBusy(i.id);
    const { error } = await createClient().from("avatar_assets").update({ status }).eq("id", i.id);
    setBusy(null);
    if (error) { toast("error", "Couldn't update that avatar."); return; }
    toast("success", status === "active" ? "Avatar is available to customers" : "Avatar hidden from customers"); router.refresh();
  }

  async function remove(i: Item) {
    if (!confirm(`Delete "${i.name}" permanently? If a customer is using it you'll need to hide it instead.`)) return;
    setBusy(i.id);
    const supabase = createClient();
    const { error } = await supabase.from("avatar_assets").delete().eq("id", i.id);
    if (error) { setBusy(null); toast("error", error.code === "23503" ? "A customer is using this avatar. Hide it instead." : "Couldn't delete that avatar."); return; }
    await supabase.storage.from("avatar-assets").remove([i.path]);
    setBusy(null); toast("success", "Avatar deleted"); router.refresh();
  }

  return (
    <Guard>
      <div className="space-y-4">
        <div className="card">
          <label className="btn cursor-pointer">
            {busy === "upload" ? "Uploading…" : "Upload SVG avatars"}
            <input type="file" accept=".svg,image/svg+xml" multiple className="sr-only" disabled={busy === "upload"} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
          <p className="mt-2 text-xs text-ink-soft">Plain shapes and paths only, up to 100 KB each. Files with scripts, links or embedded content are refused. The file name becomes the avatar's name.</p>
        </div>
        {items.length === 0 ? <div className="card text-sm text-ink-soft">No avatars yet. Until you add some, customers have nothing to choose from.</div> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((i) => (
              <li key={i.id} className="card flex flex-col items-center gap-2 p-3">
                <img src={i.url} alt="" className={`h-20 w-20 rounded-full border border-paper-line bg-white ${i.status !== "active" ? "opacity-40" : ""}`} />
                <p className="w-full truncate text-center text-sm font-medium" title={i.name}>{i.name}</p>
                <p className="text-xs text-ink-mute">{i.status === "active" ? "Available" : "Hidden"}</p>
                <div className="flex gap-3 text-xs">
                  {i.status === "active"
                    ? <button className="inline-block py-2 underline" disabled={busy === i.id} onClick={() => setStatus(i, "archived")}>Hide</button>
                    : <button className="inline-block py-2 underline" disabled={busy === i.id} onClick={() => setStatus(i, "active")}>Show</button>}
                  <button className="inline-block py-2 text-bad underline" disabled={busy === i.id} onClick={() => remove(i)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Guard>
  );
}
