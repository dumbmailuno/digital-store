/**
 * Strict allow-list check for avatar SVGs. An SVG is code (it can carry scripts, event handlers and
 * external references), so we accept only plain drawing elements and reject everything else, even if
 * it looks harmless. Avatars are also only ever shown through <img>, where scripts cannot run;
 * this check keeps the stored file safe if someone opens its link directly.
 */
const ELEMENTS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs",
  "lineargradient", "radialgradient", "stop", "clippath", "mask", "title", "desc"]);
const MAX_BYTES = 100 * 1024;

export function checkSvg(text: string): { ok: true } | { ok: false; reason: string } {
  if (new TextEncoder().encode(text).length > MAX_BYTES) return { ok: false, reason: "The file is over 100 KB." };
  const src = text.replace(/^﻿/, "").trim();
  const body = src.replace(/^<\?xml[^>]*\?>\s*/i, "");
  if (!/^<svg[\s>]/i.test(body)) return { ok: false, reason: "That doesn't look like an SVG file." };
  if (/<!/.test(body)) return { ok: false, reason: "Remove comments, DOCTYPE and entity declarations from the SVG." };
  if (/<\?/.test(body)) return { ok: false, reason: "Remove processing instructions from the SVG." };

  const tags = body.match(/<\/?[^>]*>/g) ?? [];
  if (/[<>]/.test(body.replace(/<\/?[^<>]*>/g, ""))) return { ok: false, reason: "Malformed SVG." };
  for (const tag of tags) {
    const m = /^<\/?\s*([A-Za-z][\w:-]*)/.exec(tag);
    if (!m) return { ok: false, reason: "Malformed SVG." };
    const name = m[1].toLowerCase();
    if (!ELEMENTS.has(name)) return { ok: false, reason: `The element <${m[1]}> isn't allowed in avatars. Use plain shapes and paths.` };
    if (tag.startsWith("</")) continue;
    const attrs = tag.slice(m[0].length).replace(/\/?>$/, "");
    const re = /([^\s=/"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'))?/g;
    let a: RegExpExecArray | null;
    while ((a = re.exec(attrs))) {
      const key = a[1].toLowerCase();
      const val = (a[2] ?? a[3] ?? "").trim();
      if (!key) continue;
      if (key.startsWith("on")) return { ok: false, reason: "Event handlers aren't allowed." };
      if (key === "href" || key === "xlink:href" || key === "src" || key === "style" || key === "class") return { ok: false, reason: `The "${a[1]}" attribute isn't allowed. Use plain presentation attributes like fill and stroke.` };
      if (key.startsWith("xmlns") && key !== "xmlns" && key !== "xmlns:xlink") return { ok: false, reason: "Unexpected namespace." };
      const lower = val.toLowerCase();
      if (/javascript:|data:|vbscript:|&#|<|>/.test(lower)) return { ok: false, reason: "The SVG contains a disallowed value." };
      if (/url\(/i.test(val) && !/^url\(\s*#[\w-]+\s*\)$/i.test(val)) return { ok: false, reason: "External references aren't allowed." };
    }
  }
  return { ok: true };
}
