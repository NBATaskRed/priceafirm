import Link from "next/link";
import type { ReactNode } from "react";
import { NavLinks, BottomNav } from "./NavLinks";
import { signOutAction } from "@/lib/actions/auth";
import { Logo } from "./Logo";
import { PointsChip } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "@/lib/theme";

export function AppShell({ children, balance, email, admin, theme }: { children: ReactNode; balance: number; email: string; admin: boolean; theme: Theme }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg">
        <div className="mx-auto flex min-h-14 w-full max-w-[1160px] items-center gap-3 px-5 py-2.5 md:gap-6 md:px-6 md:py-3">
          <Link href="/value" className="flex items-center rounded" aria-label="PriceAFirm home">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 flex-wrap items-center gap-1 md:flex">
            <NavLinks admin={admin} />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <PointsChip balance={balance} />
            <details className="relative">
              <summary className="btn btn-ghost btn-sm cursor-pointer list-none" aria-label="Account menu">
                <span className="hidden max-w-[9rem] truncate sm:inline">{email}</span>
                <span className="sm:hidden">Account</span>
              </summary>
              <div className="card absolute right-0 z-40 mt-2 w-60 p-2 text-sm">
                <p className="truncate px-2 py-1 text-xs text-muted">{email}</p>
                <div className="px-2 py-2">
                  <p className="mb-1.5 text-xs text-muted">Theme</p>
                  <ThemeToggle initial={theme} compact />
                </div>
                <Link href="/account" className="flex min-h-11 items-center rounded-lg px-2 hover:bg-surface-2">
                  Account and password
                </Link>
                <Link href="/terms" className="flex min-h-11 items-center rounded-lg px-2 hover:bg-surface-2">
                  Terms
                </Link>
                <Link href="/privacy" className="flex min-h-11 items-center rounded-lg px-2 hover:bg-surface-2">
                  Privacy
                </Link>
                <form action={signOutAction}>
                  <button type="submit" className="flex min-h-11 w-full items-center rounded-lg px-2 text-left hover:bg-surface-2">
                    Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1160px] flex-1 px-5 pb-28 pt-4 md:px-6 md:pb-16 md:pt-10">{children}</main>
      <BottomNav />
    </div>
  );
}
