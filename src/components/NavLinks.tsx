"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY = [
  { href: "/deals", label: "Find deals", short: "Find deals" },
  { href: "/value", label: "Value businesses", short: "Value" },
  { href: "/add", label: "Add a listing", short: "Add URL" },
  { href: "/points", label: "My points", short: "Points" },
  { href: "/unlocked", label: "Opened listings", short: "Opened" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {PRIMARY.map((item) => (
        <Link key={item.href} href={item.href} className="nav-link" aria-current={isActive(pathname, item.href) ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
      {admin ? (
        <Link href="/admin" className="nav-link" aria-current={isActive(pathname, "/admin") ? "page" : undefined}>
          Admin
        </Link>
      ) : null}
    </>
  );
}

/** Phone bottom nav (spec 4.6): Find deals, Value, Add URL, Points; current in amber. */
export function BottomNav() {
  const pathname = usePathname();
  const items = PRIMARY.slice(0, 4);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-bg px-1.5 pt-2 md:hidden"
      style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}
    >
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="bottom-nav-link" aria-current={isActive(pathname, item.href) ? "page" : undefined}>
          {item.short}
        </Link>
      ))}
    </nav>
  );
}
