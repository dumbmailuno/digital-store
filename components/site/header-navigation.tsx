"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  House, Menu, Moon, Settings2, ShoppingBag, Sun, UserRound, UserRoundPlus, X,
} from "lucide-react";
import { useCart } from "@/lib/cart";
import { SignOutButton } from "./sign-out";
import { DismissibleDetails } from "@/components/ui/dismissible-details";

type HeaderNavigationProps = {
  storeName: string;
  logoUrl: string | null;
  signedIn: boolean;
  staff: boolean;
  developer: boolean;
};

function ThemeSetting() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const syncTheme = () => setDark(document.documentElement.classList.contains("dark"));
    const preference = window.localStorage.getItem("store-theme");
    const isDark = preference === "dark"
      || (preference !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
    syncTheme();
    window.addEventListener("store-theme-change", syncTheme);
    return () => window.removeEventListener("store-theme-change", syncTheme);
  }, []);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("store-theme", next ? "dark" : "light");
    window.dispatchEvent(new Event("store-theme-change"));
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggleTheme}
      className="flex min-h-11 w-full items-center justify-between gap-5 rounded-xl px-3 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
    >
      <span className="flex items-center gap-2.5">
        {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        Dark theme
      </span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${dark ? "bg-white" : "bg-white/25"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform ${dark ? "translate-x-[18px] bg-black" : "translate-x-0.5 bg-white"}`} />
      </span>
    </button>
  );
}

function SettingsMenu({ signedIn }: { signedIn: boolean }) {
  return (
    <DismissibleDetails
      label="Settings"
      className="group relative"
      summaryClassName="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white [&::-webkit-details-marker]:hidden"
      summary={<Settings2 size={18} aria-hidden="true" />}
    >
      <div className="absolute right-0 top-full z-50 mt-3 w-56 rounded-2xl border border-white/10 bg-nav p-2 shadow-xl">
        <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">Settings</p>
        <ThemeSetting />
        {signedIn && (
          <Link href="/account/security" className="flex min-h-11 items-center rounded-xl px-3 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white">
            Account security
          </Link>
        )}
      </div>
    </DismissibleDetails>
  );
}

function CartLink({ count, ready, onClick, mobile = false }: { count: number; ready: boolean; onClick?: () => void; mobile?: boolean }) {
  return (
    <Link
      href="/cart"
      onClick={onClick}
      className={`${mobile ? "nav-mobile-item flex min-h-11 w-full rounded-xl px-3 text-white/70" : "nav-enter-item inline-flex min-h-10 rounded-full px-3 text-white/65"} items-center gap-2 text-[13px] font-medium transition-colors hover:bg-white/10 hover:text-white`}
    >
      <span className="relative inline-flex">
        <ShoppingBag size={17} aria-hidden="true" />
        {ready && count > 0 && (
          <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-white px-1 text-center text-[10px] leading-4 text-black">
            {count}
          </span>
        )}
      </span>
      Cart
    </Link>
  );
}

export function HeaderNavigation({
  storeName, logoUrl, signedIn, staff, developer,
}: HeaderNavigationProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { ids, ready } = useCart();
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-30 bg-paper/95 px-3 pb-3 pt-3 backdrop-blur-xl supports-[backdrop-filter]:bg-paper/85 font-poppins sm:px-5 sm:pb-4 sm:pt-4">
      <div className={`nav-enter mx-auto flex min-h-[62px] max-w-[1200px] items-center justify-between gap-3 bg-nav px-3 text-white sm:px-5 ${menuOpen ? "rounded-t-[28px]" : "rounded-full"}`}>
        <Link href="/" onClick={closeMenu} className="nav-enter-brand flex min-h-11 min-w-0 shrink-0 items-center gap-2.5 rounded-lg text-[17px] font-semibold tracking-[-0.02em] text-white">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-7 w-auto max-w-[112px] object-contain brightness-0 invert" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white text-black">
              <ShoppingBag size={17} strokeWidth={2} aria-hidden="true" />
            </span>
          )}
          <span className="max-w-[35vw] truncate">{storeName}</span>
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center justify-end gap-0.5 lg:flex">
          <Link href="/" className="nav-enter-item inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-white">
            <House size={16} aria-hidden="true" />Home
          </Link>
          <CartLink count={ids.length} ready={ready} />
          {staff && <Link href="/admin" className="nav-enter-item inline-flex min-h-10 items-center rounded-full px-3 text-[13px] font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-white">Admin</Link>}
          {developer && <Link href="/dev" className="nav-enter-item inline-flex min-h-10 items-center rounded-full px-3 text-[13px] font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-white">Dev</Link>}
          {signedIn && (
            <Link href="/account" aria-label="Account" title="Account" className="nav-enter-item ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white">
              <UserRound size={18} aria-hidden="true" />
            </Link>
          )}
          {signedIn ? (
            <>
              <div className="nav-enter-item ml-1"><SettingsMenu signedIn /></div>
              <span className="nav-enter-item ml-1"><SignOutButton /></span>
            </>
          ) : (
            <Link href="/register" className="nav-enter-download ml-1 inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[.98]">
              <UserRoundPlus size={16} aria-hidden="true" />
              Create account
            </Link>
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:hidden">
          {signedIn && <div className="nav-enter-item"><SettingsMenu signedIn /></div>}
          {!signedIn && (
            <Link
              href="/register"
              aria-label="Create account"
              title="Create account"
              className="nav-enter-download inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-[1.04] active:scale-[.97] sm:w-auto sm:gap-2 sm:px-3"
            >
              <UserRoundPlus size={17} aria-hidden="true" />
              <span className="hidden text-[13px] font-semibold sm:inline">Create account</span>
            </Link>
          )}
          {signedIn && (
            <Link
              href="/account"
              aria-label="Account"
              title="Account"
              className="nav-enter-item inline-flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <UserRound size={18} aria-hidden="true" />
            </Link>
          )}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <nav
        id="mobile-navigation"
        aria-label="Mobile main"
        aria-hidden={!menuOpen}
        className={`nav-mobile ${menuOpen ? "nav-mobile-open" : ""} mx-auto max-w-[1200px] rounded-b-[28px] bg-nav px-3 text-white lg:hidden`}
      >
        <div className="border-t border-white/10 py-2">
          <Link href="/" onClick={closeMenu} tabIndex={menuOpen ? 0 : -1} className="nav-mobile-item flex min-h-11 items-center gap-2 rounded-xl px-3 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"><House size={16} aria-hidden="true" />Home</Link>
          <CartLink count={ids.length} ready={ready} onClick={closeMenu} mobile />
          {staff && <Link href="/admin" onClick={closeMenu} tabIndex={menuOpen ? 0 : -1} className="nav-mobile-item flex min-h-11 items-center rounded-xl px-3 text-[13px] font-medium text-white/70 hover:bg-white/10 hover:text-white">Admin</Link>}
          {developer && <Link href="/dev" onClick={closeMenu} tabIndex={menuOpen ? 0 : -1} className="nav-mobile-item flex min-h-11 items-center rounded-xl px-3 text-[13px] font-medium text-white/70 hover:bg-white/10 hover:text-white">Dev</Link>}
          {signedIn ? (
            <>
              <Link href="/account" onClick={closeMenu} tabIndex={menuOpen ? 0 : -1} className="nav-mobile-item flex min-h-11 items-center gap-2 rounded-xl px-3 text-[13px] font-medium text-white/70 hover:bg-white/10 hover:text-white"><UserRound size={16} aria-hidden="true" />Account</Link>
              <div className="nav-mobile-item flex min-h-11 items-center px-3"><SignOutButton onSignOut={closeMenu} /></div>
            </>
          ) : (
            <Link href="/login" onClick={closeMenu} tabIndex={menuOpen ? 0 : -1} className="nav-mobile-item flex min-h-11 items-center gap-2 rounded-xl px-3 text-[13px] font-medium text-white/70 hover:bg-white/10 hover:text-white"><UserRound size={16} aria-hidden="true" />Sign in</Link>
          )}
        </div>
      </nav>
    </header>
  );
}
