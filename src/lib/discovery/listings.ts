import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ListingSnapshot, SourceRights } from "@/lib/domain/types";
import type { PublishedStats } from "@/lib/quant/model";

export interface AggregateCount {
  n_count: number;
  n_eff: number;
}

export interface ApprovedListing {
  snapshot: ListingSnapshot;
  counts: AggregateCount;
}

/** Latest approved snapshot per business, with participation counts only (never stats). */
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
  const snapshots = [...latest.values()];
  if (!snapshots.length) return [];
  const { data: agg } = await admin
    .from("aggregation_cache")
    .select("snapshot_id,n_count,n_eff")
    .in(
      "snapshot_id",
      snapshots.map((s) => s.id),
    );
  const counts = new Map<string, AggregateCount>();
  for (const a of (agg ?? []) as Array<{ snapshot_id: string; n_count: number; n_eff: number }>) {
    counts.set(a.snapshot_id, { n_count: a.n_count, n_eff: Number(a.n_eff) });
  }
  return snapshots.map((snapshot) => {
    const c = counts.get(snapshot.id) ?? { n_count: 0, n_eff: 0 };
    const denorm = (snapshot as ListingSnapshot & { independent_count?: number | null }).independent_count;
    return { snapshot, counts: { n_count: denorm ?? c.n_count, n_eff: c.n_eff } };
  });
}

export async function loadRightsMap(domains: string[]): Promise<Map<string, SourceRights>> {
  const uniq = [...new Set(domains)];
  if (!uniq.length) return new Map();
  const { data } = await supabaseAdmin().from("source_domains").select("*").in("domain", uniq);
  const map = new Map<string, SourceRights>();
  for (const r of (data ?? []) as SourceRights[]) map.set(r.domain, r);
  return map;
}

export async function loadRights(domain: string): Promise<SourceRights | null> {
  const { data } = await supabaseAdmin().from("source_domains").select("*").eq("domain", domain).maybeSingle();
  return (data as SourceRights | null) ?? null;
}

/** Business ids this user is exposed to (preview/ranked_list/reveal) plus those already valued. */
export async function loadUserBusinessState(userId: string): Promise<{ exposed: Set<string>; valued: Map<string, string>; unlocked: Set<string> }> {
  const admin = supabaseAdmin();
  const [{ data: ex }, { data: fc }, { data: un }] = await Promise.all([
    admin.from("exposure_events").select("business_id,surface").eq("user_id", userId).in("surface", ["preview", "ranked_list", "reveal"]),
    admin.from("forecast_submissions").select("business_id,snapshot_id").eq("user_id", userId),
    admin.from("url_unlocks").select("business_id").eq("user_id", userId),
  ]);
  const exposed = new Set<string>();
  for (const e of (ex ?? []) as Array<{ business_id: string }>) exposed.add(e.business_id);
  const valued = new Map<string, string>();
  for (const f of (fc ?? []) as Array<{ business_id: string; snapshot_id: string }>) valued.set(f.business_id, f.snapshot_id);
  const unlocked = new Set<string>();
  for (const u of (un ?? []) as Array<{ business_id: string }>) unlocked.add(u.business_id);
  return { exposed, valued, unlocked };
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
  /** The asking price is shown only when the source permits it. */
  askingPrice: number | null;
}

/**
 * Crowd statistics from aggregation_cache, filtered by source rights. Ask ratios only when
 * may_display_ev_to_ask; the ask itself only when may_display_ask. Never called from the Value queue.
 */
export async function loadCrowdStats(snapshot: ListingSnapshot, rights: SourceRights | null): Promise<CrowdStatsView> {
  const { data } = await supabaseAdmin().from("aggregation_cache").select("n_count,n_eff,stats").eq("snapshot_id", snapshot.id).maybeSingle();
  const row = data as { n_count: number; n_eff: number; stats: Partial<PublishedStats> & { nInd?: number } } | null;
  const s = row?.stats ?? {};
  const denorm = (snapshot as ListingSnapshot & { independent_count?: number | null }).independent_count;
  const nCount = Number(s.nInd ?? denorm ?? row?.n_count ?? 0);
  const mayAsk = Boolean(rights?.may_display_ask) && !rights?.revoked_at;
  const mayRatio = mayAsk && Boolean(rights?.may_display_ev_to_ask);
  const hasCrowd = nCount > 0;
  return {
    nCount,
    nEff: Number(row?.n_eff ?? 0),
    evidence: s.evidence ?? (nCount <= 0 ? "none" : nCount === 1 ? "very_limited" : nCount <= 4 ? "preliminary" : nCount <= 9 ? "moderate" : "many"),
    medianEv: hasCrowd ? (s.medianEv ?? null) : null,
    meanEv: hasCrowd ? (s.meanEv ?? null) : null,
    p10: hasCrowd ? (s.p10 ?? null) : null,
    p90: hasCrowd ? (s.p90 ?? null) : null,
    prAboveAsk: hasCrowd && mayRatio ? (s.prAboveAsk ?? null) : null,
    medianToAsk: hasCrowd && mayRatio ? (s.medianToAsk ?? null) : null,
    meanToAsk: hasCrowd && mayRatio ? (s.meanToAsk ?? null) : null,
    disagreement: hasCrowd ? (s.disagreement ?? null) : null,
    concentration: hasCrowd ? (s.concentration ?? null) : null,
    askingPrice: mayAsk ? snapshot.asking_price : null,
  };
}
