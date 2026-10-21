import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recomputeSkill, recomputeSnapshot } from "@/lib/quant/service";

/** Shared by the admin "Recompute all" button and the daily cron route. Not a server action. */
export async function recomputeEverything(): Promise<{ snapshots: number; skillRows: number; mode: string }> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("listing_snapshots").select("id").eq("status", "approved");
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  for (const id of ids) await recomputeSnapshot(id, null);
  const skillRows = await recomputeSkill();
  return { snapshots: ids.length, skillRows, mode: process.env.SCORING_MODE ?? "live" };
}
