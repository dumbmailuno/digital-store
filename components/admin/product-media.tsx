"use client";

import { Guard } from "@/components/admin/read-only";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { EXT, MIME, mb, sniff } from "@/lib/files";
import { publicUrl } from "@/lib/storage";

type Img = { id: string; path: string; position: number };
type File_ = { id: string; path: string; size_bytes: number; version: number } | null;

const MAX_IMG = 5 * 1024 * 1024, MAX_ZIP = 500 * 1024 * 1024, MAX_IMAGES = 6;

export function ProductMedia({ productId, images, file, published }: { productId: string; images: Img[]; file: File_; published: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const sorted = [...images].sort((a, b) => a.position - b.position);

  async function addImages(list: FileList | null) {
    if (!list?.length || busy) return;
    const files = Array.from(list).slice(0, MAX_IMAGES - images.length);
    if (images.length >= MAX_IMAGES) { toast("error", `A product can have up to ${MAX_IMAGES} images.`); return; }
    setBusy("images");
    const supabase = createClient();
    let next = Math.max(-1, ...images.map((i) => i.position)) + 1, added = 0;
    for (const f of files) {
      const kind = await sniff(f);
      if (kind !== "png" && kind !== "jpeg" && kind !== "webp") { toast("error", `${f.name}: use a PNG, JPG or WebP image.`); continue; }
      if (f.size > MAX_IMG) { toast("error", `${f.name} is ${mb(f.size)}. Images must be under 5 MB.`); continue; }
      const path = `${productId}/${crypto.randomUUID()}.${EXT[kind]}`;
      const up = await supabase.storage.from("product-images").upload(path, f, { contentType: MIME[kind], upsert: false });
      if (up.error) { toast("error", `Couldn't upload ${f.name}.`); continue; }
      const ins = await supabase.from("product_images").insert({ product_id: productId, path, position: next++ });
      if (ins.error) { await supabase.storage.from("product-images").remove([path]); toast("error", `Couldn't save ${f.name}.`); continue; }
      added++;
    }
    setBusy(null);
    if (added) { toast("success", `${added} image${added > 1 ? "s" : ""} added`); router.refresh(); }
  }

  async function removeImage(i: Img) {
    const supabase = createClient();
    const { error } = await supabase.from("product_images").delete().eq("id", i.id);
    if (error) { toast("error", "Couldn't remove that image."); return; }
    await supabase.storage.from("product-images").remove([i.path]);
    toast("success", "Image removed"); router.refresh();
  }

  async function makeMain(i: Img) {
    // position -1 sorts first and stays unique, so no swap is needed
    const lowest = Math.min(...images.map((x) => x.position));
    const { error } = await createClient().from("product_images").update({ position: lowest - 1 }).eq("id", i.id);
    if (error) { toast("error", "Couldn't change the main image."); return; }
    router.refresh();
  }

  async function uploadZip(list: FileList | null) {
    const f = list?.[0];
    if (!f || busy) return;
    if (!/\.zip$/i.test(f.name) || (await sniff(f)) !== "zip") { toast("error", "That doesn't look like a ZIP file."); return; }
    if (f.size > MAX_ZIP) { toast("error", `That file is ${mb(f.size)}. The limit is 500 MB.`); return; }
    setBusy("zip");
    const supabase = createClient();
    const version = (file?.version ?? 0) + 1;
    // the name on disk is generated, never taken from the uploaded file
    const path = `${productId}/v${version}-${crypto.randomUUID()}.zip`;
    const up = await supabase.storage.from("product-files").upload(path, f, { contentType: "application/zip", upsert: false });
    if (up.error) { setBusy(null); toast("error", "The upload failed. Check your connection and try again. Very large files may exceed your storage plan's limit."); return; }
    const res = file
      ? await supabase.from("product_files").update({ path, size_bytes: f.size, version }).eq("id", file.id)
      : await supabase.from("product_files").insert({ product_id: productId, path, size_bytes: f.size, version });
    if (res.error) { await supabase.storage.from("product-files").remove([path]); setBusy(null); toast("error", "Couldn't save the file record."); return; }
    if (file) await supabase.storage.from("product-files").remove([file.path]); // best effort: old version
    setBusy(null);
    toast("success", file ? "ZIP replaced. New downloads use the new file." : "ZIP uploaded. You can publish the product now.");
    router.refresh();
  }

  return (
    <Guard>
    <div className="space-y-6">
      <section className="card space-y-3">
        <div><h2 className="text-sm font-semibold">Product file (ZIP)</h2><p className="text-xs text-ink-soft">Private. Customers only receive it through a short-lived link after payment.</p></div>
        {file ? <p className="text-sm">Current file: <b>version {file.version}</b> · {mb(file.size_bytes)}</p> : <p className="text-sm text-warn">No file yet. The product can't be published without one.</p>}
        <label className={`btn btn-ghost w-full cursor-pointer sm:w-auto ${busy === "zip" ? "pointer-events-none opacity-50" : ""}`}>
          {busy === "zip" ? "Uploading… keep this tab open" : file ? "Replace ZIP file" : "Upload ZIP file"}
          <input type="file" accept=".zip,application/zip" className="sr-only" onChange={(e) => { uploadZip(e.target.files); e.target.value = ""; }} />
        </label>
        {published && file && <p className="text-xs text-ink-mute">Replacing a published product's file takes effect for every download from now on.</p>}
      </section>

      <section className="card space-y-3">
        <div><h2 className="text-sm font-semibold">Images</h2><p className="text-xs text-ink-soft">Up to {MAX_IMAGES}, PNG/JPG/WebP, under 5 MB each. The first is the main image.</p></div>
        {sorted.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sorted.map((i, idx) => (
              <li key={i.id} className="overflow-hidden rounded-2xl border border-paper-line">
                <div className="aspect-[4/3] bg-paper-dim"><img src={publicUrl("product-images", i.path)!} alt="" className="h-full w-full object-cover" /></div>
                <div className="flex items-center justify-between gap-1 p-2 text-xs">
                  {idx === 0 ? <span className="font-medium text-ok">Main image</span> : <button className="underline" onClick={() => makeMain(i)}>Make main</button>}
                  <button className="text-bad underline" onClick={() => removeImage(i)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {images.length < MAX_IMAGES && (
          <label className={`btn btn-ghost w-full cursor-pointer sm:w-auto ${busy === "images" ? "pointer-events-none opacity-50" : ""}`}>
            {busy === "images" ? "Uploading…" : "Add images"}
            <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </section>
    </div>
    </Guard>
  );
}
