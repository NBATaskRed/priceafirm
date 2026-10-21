import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ListingSnapshot, SourceDomain } from "@/lib/domain/types";
import { evidenceLabel, type PublishedStats } from "@/lib/quant/model";

export interface AggregateCount {
  n_count: number;
  n_eff: number;
}

export interface ApprovedListing {
  snapshot: ListingSnapshot;
  counts: AggregateCount;
}

/** Latest approved snapshot per business from a live source, with participation counts only (never stats). */
export async function loadApprovedListings(): Promise<ApprovedListing[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("listing_snapshots")
    .select("*")
    .eq("status", "approved")
    .order("business_id", { ascending: true })
    .order("version", { ascending: false });
  if (error) throw error;
  const latest = new Map<string, ListingSnapshot>();
  for (const row of (data ?? []) as ListingSnapshot[]) {
    if (!latest.has(row.business_id)) latest.set(row.business_id, row);
  }
  let snapshots = [...latest.values()];
  if (!snapshots.length) return [];
  const sources = await loadSourceMap(snapshots.map((s) => s.source_domain));
  snapshots = snapshots.filter((s) => sourceIsLive(sources.get(s.source_domain)));
  const { data: agg } = await admin
    .from("aggregation_cache")
    .select("snapshot_id,n_count,n_eff")
    .in(
      "snapshot_id",
      snapshots.map((s) => s.id),
    );
  const eff = new Map<string, number>();
  for (const a of (agg ?? []) as Array<{ snapshot_id: string; n_count: number; n_eff: number }>) eff.set(a.snapshot_id, Number(a.n_eff));
  return snapshots.map((snapshot) => ({ snapshot, counts: { n_count: snapshot.independent_count ?? 0, n_eff: eff.get(snapshot.id) ?? 0 } }));
}

/** A source is live unless excluded or removed on complaint. Unknown domains count as live (permissionless). */
export function sourceIsLive(s: SourceDomain | null | undefined): boolean {
  if (!s) return true;
  return s.status !== "blocked" && s.source_type !== "excluded" && !s.removed_at;
}

export async function loadSourceMap(domains: string[]): Promise<Map<string, SourceDomain>> {
  const uniq = [...new Set(domains)];
  if (!uniq.length) return new Map();
  const { data } = await supabaseAdmin().from("source_domains").select("*").in("domain", uniq);
  const map = new Map<string, SourceDomain>();
  for (const r of (data ?? []) as SourceDomain[]) map.set(r.domain, r);
  return map;
}

export async function loadSource(domain: string): Promise<SourceDomain | null> {
  const { data } = await supabaseAdmin().from("source_domains").select("*").eq("domain", domain).maybeSingle();
  return (data as SourceDomain | null) ?? null;
}

/** Business ids this user is exposed to plus those already valued and unlocked. */
export async function loadUserBusinessState(userId: string): Promise<{ exposed: Set<string>; valued: Map<string, string>; unlocked: Set<string>; selfSubmitted: Set<string> }> {
  const admin = supabaseAdmin();
  const [{ data: ex }, { data: fc }, { data: un }, { data: ss }] = await Promise.all([
    admin.from("exposure_events").select("business_id").eq("user_id", userId).in("surface", ["preview", "ranked_list", "reveal", "find_deals_row"]),
    admin.from("forecast_submissions").select("business_id,snapshot_id").eq("user_id", userId),
    admin.from("url_unlocks").select("business_id").eq("user_id", userId),
    admin.from("source_submissions").select("business_id").eq("user_id", userId).in("status", ["approved", "pending_review", "duplicate"]),
  ]);
  const exposed = new Set<string>();
  for (const e of (ex ?? []) as Array<{ business_id: string }>) exposed.add(e.business_id);
  const valued = new Map<string, string>();
  for (const f of (fc ?? []) as Array<{ business_id: string; snapshot_id: string }>) valued.set(f.business_id, f.snapshot_id);
  const unlocked = new Set<string>();
  for (const u of (un ?? []) as Array<{ business_id: string }>) unlocked.add(u.business_id);
  const selfSubmitted = new Set<string>();
  for (const s of (ss ?? []) as Array<{ business_id: string | null }>) if (s.business_id) selfSubmitted.add(s.business_id);
  return { exposed, valued, unlocked, selfSubmitted };
}

export async function isExposed(userId: string, businessId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().rpc("is_exposed", { p_user: userId, p_business: businessId });
  return Boolean(data);
}

export interface CrowdStatsView {
  nCount: number;
  nEff: number;
  evidence: PublishedStats["evidence"];
  medianEv: number | null;
  meanEv: number | null;
  p10: number | null;
  p90: number | null;
  prAboveAsk: number | null;
  medianToAsk: number | null;
  meanToAsk: number | null;
  disagreement: number | null;
  concentration: number | null;
  askingPrice: number | null;
}

/**
 * Crowd statistics from aggregation_cache. The displayed count is the snapshot's independent_count so
 * it matches every other surface. Never called from the Value queue.
 */
export async function loadCrowdStats(snapshot: ListingSnapshot): Promise<CrowdStatsView> {
  const { data } = await supabaseAdmin().from("aggregation_cache").select("n_count,n_eff,stats").eq("snapshot_id", snapshot.id).maybeSingle();
  const row = data as { n_count: number; n_eff: number; stats: Partial<PublishedStats> } | null;
  const s = row?.stats ?? {};
  const nCount = snapshot.independent_count ?? Number(s.nInd ?? row?.n_count ?? 0);
  const hasCrowd = nCount > 0;
  return {
    nCount,
    nEff: Number(row?.n_eff ?? 0),
    evidence: evidenceLabel(nCount),
    medianEv: hasCrowd ? (s.medianEv ?? null) : null,
    meanEv: hasCrowd ? (s.meanEv ?? null) : null,
    p10: hasCrowd ? (s.p10 ?? null) : null,
    p90: hasCrowd ? (s.p90 ?? null) : null,
    prAboveAsk: hasCrowd ? (s.prAboveAsk ?? null) : null,
    medianToAsk: hasCrowd ? (s.medianToAsk ?? null) : null,
    meanToAsk: hasCrowd ? (s.meanToAsk ?? null) : null,
    disagreement: hasCrowd ? (s.disagreement ?? null) : null,
    concentration: hasCrowd ? (s.concentration ?? null) : null,
    askingPrice: snapshot.asking_price,
  };
}
