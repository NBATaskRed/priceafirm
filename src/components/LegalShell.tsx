import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function LegalShell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" aria-label="PriceAFirm home">
          <Logo />
        </Link>
        <nav className="flex gap-1 text-sm">
          <Link href="/terms" className="nav-link">
            Terms
          </Link>
          <Link href="/privacy" className="nav-link">
            Privacy
          </Link>
          <Link href="/login" className="nav-link">
            Sign in
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-8">
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Pilot version {updated}. Plain language, no legalese. If anything here is unclear, ask before contributing.</p>
        <div className="prose-pf mt-8 space-y-8 text-[15px] leading-relaxed">{children}</div>
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-text/90">{children}</div>
    </section>
  );
}
