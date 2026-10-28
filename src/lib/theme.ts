export type Theme = "light" | "dark";
export const THEME_COOKIE = "paf_theme";
/** Light unless the member chose dark. */
export function parseTheme(v: string | undefined | null): Theme {
  return v === "dark" ? "dark" : "light";
}
