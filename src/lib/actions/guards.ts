import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const FORECASTS_PER_DAY = 20;
export const SEARCHES_PER_HOUR = 60;

async function countSince(table: string, userId: string, sinceMs: number): Promise<number> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { count } = await supabaseAdmin().from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  return count ?? 0;
}

export async function forecastRateLimited(userId: string): Promise<boolean> {
  return (await countSince("forecast_submissions", userId, 24 * 60 * 60 * 1000)) >= FORECASTS_PER_DAY;
}

export async function searchRateLimited(userId: string): Promise<boolean> {
  return (await countSince("query_events", userId, 60 * 60 * 1000)) >= SEARCHES_PER_HOUR;
}

/** Parse "2,900,000" / "$2.9M" / "2900000" into an integer number of dollars, or null. */
export function parseMoney(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw) : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/[$,\s_]/g, "");
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "m" ? 1_000_000 : m[2] === "k" ? 1_000 : 1);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v ? v : null;
}

/** Tri-state checkbox/select: "yes" | "no" | "" */
export function triState(formData: FormData, key: string): boolean | null {
  const v = str(formData, key);
  if (v === "yes" || v === "true") return true;
  if (v === "no" || v === "false") return false;
  return null;
}
