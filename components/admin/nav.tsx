"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; badge?: number };

/** Horizontal scroller on phones, vertical sidebar from md up. */
export function SectionNav({ items, label }: { items: NavItem[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:mb-0 md:flex-col md:overflow-visible md:px-0">
      {items.map((i) => {
        const on = i.href === "/admin" || i.href === "/dev" ? path === i.href : path === i.href || path.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={`flex min-h-[40px] shrink-0 items-center justify-between gap-3 rounded px-3 text-sm ${on ? "bg-accent font-medium text-white" : "text-ink-soft hover:bg-paper hover:text-ink"}`}>
            <span>{i.label}</span>
            {i.badge ? <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${on ? "bg-white/20" : "bg-warn text-white"}`}>{i.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
