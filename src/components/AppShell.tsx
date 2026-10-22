import Link from "next/link";
import type { ReactNode } from "react";
import { NavLinks, BottomNav } from "./NavLinks";
import { signOutAction } from "@/lib/actions/auth";
import { Logo } from "./Logo";

export function BalancePill({ balance, href = "/points" }: { balance: number; href?: string }) {
  const s = balance.toFixed(1).replace("-", "−");
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-sm hover:border-accent"
      aria-label={`Balance ${s} points. Open My Points.`}
    >
      <span className="text-muted">Balance</span>
      <span className="figures font-semibold">
        {s} <span className="font-medium text-muted">pts</span>
      </span>
    </Link>
  );
}

export function AppShell({ children, balance, email, admin }: { children: ReactNode; balance: number; email: string; admin: boolean }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:gap-6">
          <Link href="/value" className="flex items-center gap-2 rounded" aria-label="PriceAFirm home">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 md:flex">
            <NavLinks admin={admin} />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <BalancePill balance={balance} />
            <details className="relative">
              <summary className="btn btn-ghost btn-sm list-none cursor-pointer" aria-label="Account menu">
                <span className="max-w-[9rem] truncate">{email}</span>
              </summary>
              <div className="card absolute right-0 mt-2 w-56 p-2 text-sm shadow-xl">
                <p className="truncate px-2 py-1 text-xs text-muted">{email}</p>
                <Link href="/account" className="block rounded px-2 py-1.5 hover:bg-surface-2">
                  Account and password
                </Link>
                <Link href="/terms" className="block rounded px-2 py-1.5 hover:bg-surface-2">
                  Terms
                </Link>
                <Link href="/privacy" className="block rounded px-2 py-1.5 hover:bg-surface-2">
                  Privacy
                </Link>
                <form action={signOutAction}>
                  <button type="submit" className="block w-full rounded px-2 py-1.5 text-left hover:bg-surface-2">
                    Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:pb-12">{children}</main>
      <BottomNav />
    </div>
  );
}
