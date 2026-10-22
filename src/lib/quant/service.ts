import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Confidence, ForecastRow, ListingSnapshot } from "@/lib/domain/types";
import {
  KERNEL_VERSION,
  POOL_VERSION,
  SCORING,
  SCORING_VERSION,
  SIGMA,
  WEIGHT,
  applyNewcomerFloor,
  attractiveness,
  buildPool,
  cap,
  normalizedSkill,
  prior,
  publishedStats,
  scoreForecast,
  type Mixture,
  type OpinionInput,
  type PublishedStats,
} from "./model";

type EligibleForecast = Pick<ForecastRow, "id" | "user_id" | "org_key" | "log_value" | "confidence" | "created_at" | "eligible">;

function toOpinion(f: EligibleForecast): OpinionInput {
  return { id: f.id, logValue: f.log_value, confidence: f.confidence, orgKey: f.org_key };
}

export async function loadSnapshot(snapshotId: string): Promise<ListingSnapshot | null> {
  const { data } = await supabaseAdmin().from("listing_snapshots").select("*").eq("id", snapshotId).maybeSingle();
  return (data as ListingSnapshot | null) ?? null;
}

export async function loadEligibleForecasts(snapshotId: string): Promise<EligibleForecast[]> {
  const { data, error } = await supabaseAdmin()
    .from("forecast_submissions")
    .select("id,user_id,org_key,log_value,confidence,created_at,eligible")
    .eq("snapshot_id", snapshotId)
    .eq("eligible", true)
    .is("voided_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EligibleForecast[];
}

export function snapshotPrior(s: ListingSnapshot) {
  return prior({ askingPrice: s.asking_price, earnings: s.earnings, earningsType: s.earnings_type, industry: s.industry, tags: s.industry_tags });
}

export interface ValuationQuestion {
  snapshot: ListingSnapshot;
  mBefore: number;
  /** Displayed count: independent valuations on file (same on every surface). */
  nInd: number;
  /** Possible score is [-cap, +cap] for every confidence level. */
  cap: number;
  contractToken: string;
}

export function contractToken(snapshotId: string, mBefore: number) {
  return `${snapshotId}:${mBefore.toFixed(3)}`;
}

export async function valuationQuestion(snapshotId: string): Promise<ValuationQuestion | null> {
  const snapshot = await loadSnapshot(snapshotId);
  if (!snapshot || snapshot.status !== "approved") return null;
  const forecasts = await loadEligibleForecasts(snapshotId);
  const pool = buildPool(snapshotPrior(snapshot), forecasts.map(toOpinion));
  return { snapshot, mBefore: pool.nEff, nInd: snapshot.independent_count, cap: cap(pool.nEff), contractToken: contractToken(snapshotId, pool.nEff) };
}

export type SealResult =
  | { status: "sealed"; forecastId: string; cap: number; nInd: number }
  | { status: "bounds_changed"; question: ValuationQuestion }
  | { status: "exposed" | "already_submitted" | "snapshot_not_approved" | "invalid" | "frozen" | "removed" | "rate_limited"; message: string };

const MESSAGES: Record<string, string> = {
  exposed: "You have already seen crowd-derived value information for this business, so a scored blind valuation is not available.",
  already_submitted: "You already valued this business.",
  snapshot_not_approved: "This listing is not open for valuation.",
  removed: "This listing was removed at the publisher's request.",
  rate_limited: "Daily valuation limit reached. Try again tomorrow.",
  frozen: "This account is under review.",
  invalid: "Enter a positive enterprise value.",
};

export async function sealForecast(input: {
  userId: string;
  snapshotId: string;
  value: number;
  confidence: Confidence;
  contractToken: string;
  rationale?: string | null;
  informationLevel?: "listing" | "cim";
}): Promise<SealResult> {
  if (!(input.value > 0) || !Number.isFinite(input.value) || input.value > 1e11) return { status: "invalid", message: MESSAGES.invalid };
  const q = await valuationQuestion(input.snapshotId);
  if (!q) return { status: "snapshot_not_approved", message: MESSAGES.snapshot_not_approved };
  if (q.contractToken !== input.contractToken) return { status: "bounds_changed", question: q };

  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("trust_status").eq("id", input.userId).maybeSingle();
  if (profile?.trust_status === "frozen") return { status: "frozen", message: MESSAGES.frozen };

  const forecasts = await loadEligibleForecasts(input.snapshotId);
  const fBefore = buildPool(snapshotPrior(q.snapshot), forecasts.map(toOpinion));

  const { data, error } = await admin.rpc("submit_forecast", {
    p_user: input.userId,
    p_snapshot: input.snapshotId,
    p_value: input.value,
    p_confidence: input.confidence,
    p_sigma: SIGMA[input.confidence],
    p_weight: WEIGHT[input.confidence],
    p_m_before: fBefore.nEff,
    p_cap: q.cap,
    p_kernel_version: KERNEL_VERSION,
    p_scoring_version: SCORING_VERSION,
    p_f_before: fBefore,
    p_rationale: input.rationale ?? null,
    p_information_level: input.informationLevel ?? "listing",
  });
  if (error) throw error;
  const row = (data as Array<{ forecast_id: string | null; status: string; independent_count: number }>)[0];
  if (!row || row.status !== "sealed" || !row.forecast_id) {
    const s = (row?.status ?? "invalid") as SealResult["status"];
    return { status: s in MESSAGES ? (s as Exclude<SealResult["status"], "sealed" | "bounds_changed">) : "invalid", message: MESSAGES[s] ?? "Could not seal forecast." };
  }
  await recomputeSnapshot(input.snapshotId, row.forecast_id);
  return { status: "sealed", forecastId: row.forecast_id, cap: q.cap, nInd: row.independent_count };
}

type ScoringRow = EligibleForecast & { f_before: Mixture; cap: number; current_score: number; raw_score: number };

/** Posted scores for one user's forecasts with the newcomer floor applied to the first-5 set. */
async function postedScoresForUser(userId: string, rawById: Map<string, number>): Promise<Map<string, number>> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("forecast_submissions")
    .select("id,raw_score,created_at")
    .eq("user_id", userId)
    .eq("eligible", true)
    .is("voided_at", null)
    .order("created_at", { ascending: true })
    .limit(SCORING.newcomerCount);
  const first5 = (data ?? []) as Array<{ id: string; raw_score: number; created_at: string }>;
  const raws = first5.map((f) => rawById.get(f.id) ?? Number(f.raw_score));
  const floored = applyNewcomerFloor(raws);
  const out = new Map<string, number>();
  first5.forEach((f, i) => out.set(f.id, floored[i]));
  const clipped = floored.reduce((s, v) => s + v, 0) - raws.reduce((s, v) => s + v, 0);
  await admin.from("profiles").update({ first5_floor_clipped: Math.round(clipped * 10000) / 10000 }).eq("id", userId);
  return out;
}

/**
 * Section 6.4: revalue every earlier eligible forecast on the listing and post each delta exactly once
 * (unique event key per forecast x trigger). Idempotent on retry.
 */
export async function recomputeSnapshot(snapshotId: string, triggerForecastId: string | null) {
  const admin = supabaseAdmin();
  const live = (process.env.SCORING_MODE ?? "live") !== "shadow";
  const { data, error } = await admin
    .from("forecast_submissions")
    .select("id,user_id,org_key,log_value,confidence,created_at,eligible,f_before,cap,current_score,raw_score")
    .eq("snapshot_id", snapshotId)
    .eq("eligible", true)
    .is("voided_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as ScoringRow[];

  const rawById = new Map<string, number>();
  const zById = new Map<string, { z: number; laterCount: number }>();
  for (const i of rows) {
    const later = rows.filter((j) => j.id !== i.id && j.user_id !== i.user_id && j.created_at > i.created_at && (j.org_key == null || i.org_key == null || j.org_key !== i.org_key));
    const { z, score, laterCount } = scoreForecast({ fBefore: i.f_before, logValue: i.log_value, confidence: i.confidence, cap: Number(i.cap) }, later.map((j) => j.log_value));
    rawById.set(i.id, score);
    zById.set(i.id, { z, laterCount });
  }

  const post = async (forecastId: string, raw: number, posted: number, z: number, laterCount: number) => {
    const { error: e2 } = await admin.rpc("post_score_change", {
      p_forecast: forecastId,
      p_trigger: triggerForecastId,
      p_later_count: laterCount,
      p_z: z,
      p_raw_score: raw,
      p_posted_score: posted,
      p_scoring_version: SCORING_VERSION,
      p_live: live,
    });
    if (e2) throw e2;
  };

  // 1. Forecasts on this listing: every earlier one is rescored against all later reports now available.
  const postedByUser = new Map<string, Map<string, number>>();
  for (const i of rows) {
    const raw = rawById.get(i.id)!;
    if (!postedByUser.has(i.user_id)) postedByUser.set(i.user_id, await postedScoresForUser(i.user_id, rawById));
    const posted = postedByUser.get(i.user_id)!.get(i.id) ?? raw;
    const { z, laterCount } = zById.get(i.id)!;
    if (Math.abs(posted - Number(i.current_score)) < 0.00005 && Math.abs(raw - Number(i.raw_score)) < 0.00005) continue;
    await post(i.id, raw, posted, z, laterCount);
  }

  // 2. Newcomer floor spillover: a change here can move the floored scores of the same buyer's other
  //    first-5 forecasts on other listings. Post those too, so the floor holds on the balance exactly.
  const onThisListing = new Set(rows.map((r) => r.id));
  for (const [, floored] of postedByUser) {
    const others = [...floored.keys()].filter((id) => !onThisListing.has(id));
    if (!others.length) continue;
    const { data: cur } = await admin.from("forecast_submissions").select("id,current_score,raw_score").in("id", others);
    for (const f of (cur ?? []) as Array<{ id: string; current_score: number; raw_score: number }>) {
      const posted = floored.get(f.id)!;
      if (Math.abs(posted - Number(f.current_score)) < 0.00005) continue;
      await post(f.id, Number(f.raw_score), posted, 0, 0);
    }
  }
  await refreshAggregate(snapshotId);
}

export async function refreshAggregate(snapshotId: string): Promise<PublishedStats | null> {
  const admin = supabaseAdmin();
  const snapshot = await loadSnapshot(snapshotId);
  if (!snapshot) return null;
  const forecasts = await loadEligibleForecasts(snapshotId);
  const pool = buildPool(snapshotPrior(snapshot), forecasts.map(toOpinion));
  const stats = { ...publishedStats(pool, snapshot.asking_price), nInd: snapshot.independent_count };
  const ageDays = Math.max(0, (Date.now() - new Date(snapshot.snapshot_date).getTime()) / 86_400_000);
  await admin.from("aggregation_cache").upsert({
    snapshot_id: snapshotId,
    business_id: snapshot.business_id,
    n_count: stats.nInd,
    n_eff: stats.nEff,
    stats,
    attractiveness: attractiveness(stats, ageDays),
    model_version: `${POOL_VERSION}/${KERNEL_VERSION}/${SCORING_VERSION}`,
    updated_at: new Date().toISOString(),
  });
  return stats;
}

/** Section 11: private, provisional peer-predictive skill percentile. */
export async function recomputeSkill(minScored = 5) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("forecast_submissions")
    .select("id,user_id,raw_score,cap,score_evaluations(later_count)")
    .eq("eligible", true)
    .is("voided_at", null)
    .eq("scoring_version", SCORING_VERSION);
  if (error) throw error;
  type Row = { id: string; user_id: string; raw_score: number; cap: number; score_evaluations: Array<{ later_count: number }> };
  const byUser = new Map<string, number[]>();
  for (const r of (data ?? []) as Row[]) {
    if (!r.score_evaluations.some((e) => e.later_count > 0)) continue;
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(normalizedSkill(Number(r.raw_score), Number(r.cap)));
    byUser.set(r.user_id, arr);
  }
  const all = [...byUser.values()].flat();
  const cohortMean = all.length ? all.reduce((s, v) => s + v, 0) / all.length : 0;
  const metrics = [...byUser.entries()].map(([userId, vals]) => {
    const k = 3;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    return { userId, count: vals.length, metric: (vals.length * mean + k * cohortMean) / (vals.length + k) };
  });
  const sorted = [...metrics].sort((a, b) => a.metric - b.metric);
  const rows = metrics.map((m) => ({
    user_id: m.userId,
    scored_count: m.count,
    skill_metric: m.metric,
    percentile: sorted.length > 1 ? Math.round((100 * sorted.filter((s) => s.metric < m.metric).length) / (sorted.length - 1)) : 50,
    sufficient: m.count >= minScored && sorted.length >= 5,
    model_version: SCORING_VERSION,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length) await admin.from("skill_statistics").upsert(rows);
  return rows.length;
}
