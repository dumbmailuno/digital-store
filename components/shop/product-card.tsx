import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { publicUrl, usd } from "@/lib/storage";

export type CardProduct = { id: string; slug: string; name: string; price_usd: string; categories: { name: string } | null; product_images: { path: string; position: number }[] };

export function ProductCard({ p, view = "grid" }: { p: CardProduct; view?: "grid" | "list" }) {
  const first = [...p.product_images].sort((a, b) => a.position - b.position)[0];
  const img = publicUrl("product-images", first?.path);

  return (
    <Link
      href={`/products/${p.slug}`}
      aria-label={`${p.name}, ${usd(p.price_usd)}`}
      className={view === "grid"
      ? "group relative isolate block min-h-64 min-w-0 rounded-[32px] border border-paper-line px-3 pb-4 text-center transition-colors hover:border-ink-mute focus-visible:outline-offset-4 sm:min-h-[276px]"
        : "group relative flex min-w-0 items-center gap-4 rounded-[32px] border border-paper-line p-3 text-left transition-colors hover:border-ink-mute sm:gap-6 sm:p-4"}
    >
      <div className={view === "grid"
      ? "pointer-events-none relative z-[2] -mx-4 -mt-5 h-40 sm:h-44"
        : "pointer-events-none relative h-24 w-24 shrink-0 sm:h-32 sm:w-32"}>
        {img ? (
          <img
            src={img}
            alt=""
            loading="lazy"
            className={view === "grid"
              ? "absolute bottom-[-4px] left-1/2 h-44 w-[112%] max-w-none -translate-x-1/2 object-contain object-bottom drop-shadow-[0_8px_7px_rgba(0,0,0,0.12)] sm:h-48"
              : "h-full w-full object-contain drop-shadow-[0_8px_7px_rgba(0,0,0,0.12)]"}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-paper-dim text-xs text-ink-mute">No image</div>
        )}
      </div>
      <div className={`relative z-[4] min-w-0 ${view === "list" ? "flex-1" : ""}`}>
        {p.categories && <p className="text-[11px] text-ink-mute">{p.categories.name}</p>}
        <h2 className={`mt-1 line-clamp-2 font-medium leading-snug ${view === "grid" ? "text-[13px]" : "text-sm sm:text-base"}`}>{p.name}</h2>
        <p className="mt-1 text-[15px] font-bold tracking-tight">{usd(p.price_usd)}</p>
        <span className={`mt-2 inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-full border border-paper-line px-3 text-[11px] font-semibold transition-transform group-hover:-translate-y-0.5 group-active:scale-[.96] ${view === "list" ? "sm:mt-3" : ""}`}>
          View product <ArrowUpRight size={14} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
