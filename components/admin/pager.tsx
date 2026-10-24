import Link from "next/link";

/** Prev/next links that preserve the other query params. */
export function Pager({ basePath, params, page, pages }: { basePath: string; params: Record<string, string | undefined>; page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries({ ...params, page: p > 1 ? String(p) : undefined }).forEach(([k, v]) => v && sp.set(k, v));
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? <Link href={href(page - 1)} className="btn btn-ghost">Previous</Link> : <span />}
      <span className="text-ink-soft">Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className="btn btn-ghost">Next</Link> : <span />}
    </nav>
  );
}
