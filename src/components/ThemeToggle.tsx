"use client";

import { useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

/** Light / Dark switch. Applies instantly and remembers the choice for a year on this device. */
export function ThemeToggle({ initial, compact = false }: { initial: Theme; compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(initial);
  function pick(t: Theme) {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    document.cookie = `${THEME_COOKIE}=${t}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  const opt = (t: Theme, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={theme === t}
      onClick={() => pick(t)}
      className={`flex-1 rounded-[9px] px-3 ${compact ? "py-1 text-xs" : "py-2 text-sm"} font-semibold ${theme === t ? "bg-invert-bg text-invert-ink" : "text-text hover:bg-surface-2"}`}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-1 rounded-[12px] border border-border p-1">
      {opt("light", "Light")}
      {opt("dark", "Dark")}
    </div>
  );
}
