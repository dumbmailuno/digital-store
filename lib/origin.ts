/**
 * CSRF check for cookie-authenticated POSTs: the browser's Origin must be this site.
 * Accepts the request's own host (what the browser actually reached, so it keeps working on
 * Vercel preview URLs, www vs non-www, and a mis-set NEXT_PUBLIC_SITE_URL) or the configured site URL.
 * A page on another website cannot forge its Origin, so it can match neither.
 */
export function isSameOrigin(origin: string | null, host: string | null, site: string | undefined | null) {
  if (!origin) return false;
  let o: URL;
  try { o = new URL(origin); } catch { return false; }
  if (o.protocol !== "https:" && o.protocol !== "http:") return false;
  if (host && o.host.toLowerCase() === host.toLowerCase()) return true;
  if (site) {
    try { return o.origin === new URL(site).origin; } catch { return false; }
  }
  return false;
}
