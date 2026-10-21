import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "server-only";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Server only. All reads of member-private tables and all writes go through
 * this client inside server actions / route handlers that have already authenticated the caller.
 */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role not configured");
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
