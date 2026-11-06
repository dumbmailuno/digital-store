"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList, CreditCard, FileText, Flag, Gauge, LayoutDashboard, Package, Settings2, Tags, UserRound, Users, Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons are looked up by name here, inside the client boundary.
 * Server layouts must pass a string, never a component: functions cannot be
 * serialised across the server -> client boundary ("Functions cannot be passed
 * directly to Client Components").
 */
const ICONS = {
  ClipboardList, CreditCard, FileText, Flag, Gauge, LayoutDashboard, Package, Settings2, Tags, UserRound, Users, Wallet,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon?: NavIcon; badge?: number };

/** Horizontal pills on smaller screens and a sticky rounded sidebar on laptops. */
export function SectionNav({ items, label }: { items: NavItem[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:rounded-2xl lg:border lg:border-paper-line lg:bg-paper/95 lg:p-2 lg:backdrop-blur-xl [&::-webkit-scrollbar]:hidden">
      {items.map((i) => {
        const on = i.href === "/admin" || i.href === "/dev" ? path === i.href : path === i.href || path.startsWith(i.href + "/");
        const Icon = i.icon ? ICONS[i.icon] : undefined;
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-full px-4 text-sm transition-colors lg:px-3 ${on ? "bg-accent font-medium text-white" : "text-ink-soft hover:bg-paper-dim hover:text-ink"}`}>
            <span className="flex items-center gap-2.5">{Icon && <Icon size={17} aria-hidden="true" />}{i.label}</span>
            {i.badge ? <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${on ? "bg-white/20" : "bg-warn text-white"}`}>{i.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
