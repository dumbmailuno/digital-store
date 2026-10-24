/** Identify a file by its first bytes, not by its name or the browser-claimed type. */
export async function sniff(file: File): Promise<"png" | "jpeg" | "webp" | "zip" | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "png";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpeg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) return "zip";
  return null;
}

export const MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", zip: "application/zip" } as const;
export const EXT = { png: "png", jpeg: "jpg", webp: "webp", zip: "zip" } as const;
export const mb = (n: number) => `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB`;
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
