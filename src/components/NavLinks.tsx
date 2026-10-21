"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY = [
  { href: "/deals", label: "Find Deals", short: "Find Deals" },
  { href: "/value", label: "Value Businesses", short: "Value" },
  { href: "/add", label: "Add a Listing", short: "Add URL" },
  { href: "/points", label: "My Points", short: "Points" },
  { href: "/unlocked", label: "My Unlocked Listings", short: "Unlocked" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {PRIMARY.map((item) => (
        <Link key={item.href} href={item.href} className="nav-link text-[0.9rem]" aria-current={isActive(pathname, item.href) ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
      {admin ? (
        <Link href="/admin" className="nav-link text-[0.9rem]" aria-current={isActive(pathname, "/admin") ? "page" : undefined}>
          Admin
        </Link>
      ) : null}
    </>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  "/deals": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  ),
  "/value": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 18V9M10 18V5M16 18v-7M22 18H2" />
    </svg>
  ),
  "/add": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  ),
  "/points": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 10h3.75a1.75 1.75 0 0 1 0 3.5H10" />
    </svg>
  ),
};

export function BottomNav() {
  const pathname = usePathname();
  const items = PRIMARY.slice(0, 4);
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-bg/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="bottom-nav-link" aria-current={isActive(pathname, item.href) ? "page" : undefined}>
          {ICONS[item.href]}
          <span>{item.short}</span>
        </Link>
      ))}
    </nav>
  );
}
