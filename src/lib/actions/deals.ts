"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireMember } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { interpretSearch } from "@/lib/search";
import { applyFilters } from "@/lib/search/apply";
import { loadApprovedListings, loadCrowdStats, loadSourceMap, loadUserBusinessState, type CrowdStatsView } from "@/lib/discovery/listings";
import type { ListingSnapshot } from "@/lib/domain/types";
import { searchRateLimited } from "./guards";

import { DEALS_GATE_COOKIE } from "@/lib/discovery/gate";
const PAGE_SIZE = 10;

/** The once-per-session acknowledgement that Find deals shows crowd valuations and ends eligibility. */
export async function confirmDealsGateAction(): Promise<{ status: "ok" }> {
  await requireMember();
  const jar = await cookies();
  jar.set(DEALS_GATE_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return { status: "ok" };
}

export interface DealRow {
  businessId: string;
  snapshotId: string;
  headline: string;
  industry: string;
  location: string;
  state: string | null;
  snapshotDate: string;
  revenue: number | null;
  earnings: number | null;
  earningsType: ListingSnapshot["earnings_type"];
  askingPrice: number | null;
  nInd: number;
  evidence: CrowdStatsView["evidence"];
  medianEv: number | null;
  medianToAsk: number | null;
  prAboveAsk: number | null;
  alreadyUnlocked: boolean;
  selfSubmitted: boolean;
  publisher: string | null;
  attributionText: string | null;
  fit: number;
}

export type SearchDealsResult =
  | { status: "ok"; count: number; page: number; pages: number; chips: string[]; rows: DealRow[]; source: "llm" | "rules"; balance: number }
  | { status: "gate_required" | "rate_limited" | "invalid"; message: string };

const inputSchema = z.object({
  text: z.string().trim().min(1).max(400),
  page: z.number().int().min(1).max(500),
  minValuations: z.number().int().min(0).max(1000),
});

type BuyerProfile = { states?: string[]; industries?: string[]; minEarnings?: number };
function fitScore(s: ListingSnapshot, p: BuyerProfile): number {
  let n = 0;
  if (p.states?.length && s.state && p.states.map((x) => x.toUpperCase()).includes(s.state.toUpperCase())) n++;
  if (p.industries?.length) {
    const hay = `${s.industry} ${s.headline} ${s.industry_tags.join(" ")}`.toLowerCase();
    if (p.industries.some((i) => hay.includes(i.toLowerCase()))) n++;
  }
  if (p.minEarnings != null && s.earnings != null && s.earnings >= p.minEarnings) n++;
  return n;
}

/**
 * Natural-language search -> filters -> identifiable rows with crowd figures (design v2.2).
 * For EVERY row returned, an exposure event (surface 'ranked_list') is recorded BEFORE the row
 * leaves the server, so the person can no longer earn points on that business.
 */
export async function searchDealsAction(text: string, page = 1, minValuations = 0): Promise<SearchDealsResult> {
  const { user, profile, balance } = await requireMember();
  const parsed = inputSchema.safeParse({ text: text ?? "", page, minValuations });
  if (!parsed.success) return { status: "invalid", message: "Describe what you are looking for, in a sentence or two." };

  const jar = await cookies();
  if (jar.get(DEALS_GATE_COOKIE)?.value !== "1") {
    return { status: "gate_required", message: "Read the note before you look, then choose Show me deals." };
  }
  if (await searchRateLimited(user.id)) return { status: "rate_limited", message: "You have reached 60 searches this hour. Try again a little later." };

  const admin = supabaseAdmin();
  const interpreted = await interpretSearch(parsed.data.text);

  const [listings, mine] = await Promise.all([loadApprovedListings(), loadUserBusinessState(user.id)]);
  const sources = await loadSourceMap(listings.map((x) => x.snapshot.source_domain));
  const countBySnapshot = new Map(listings.map((l) => [l.snapshot.id, l.counts.n_count]));
  const matched = applyFilters(interpreted.filters, listings.map((l) => l.snapshot)).filter((s) => (countBySnapshot.get(s.id) ?? 0) >= parsed.data.minValuations);
  const matchedIds = matched.map((s) => s.id);

  const { data: agg } = matchedIds.length
    ? await admin.from("aggregation_cache").select("snapshot_id,attractiveness,n_count").in("snapshot_id", matchedIds)
    : { data: [] as Array<{ snapshot_id: string; attractiveness: number | null; n_count: number }> };
  const rank = new Map<string, number | null>();
  for (const a of (agg ?? []) as Array<{ snapshot_id: string; attractiveness: number | null }>) rank.set(a.snapshot_id, a.attractiveness == null ? null : Number(a.attractiveness));

  const buyer = (profile.buyer_profile ?? {}) as BuyerProfile;
  // Rows with crowd valuations rank by attractiveness, then count; rows with none rank by fit only, after them.
  const ranked = [...matched].sort((a, b) => {
    const na = countBySnapshot.get(a.id) ?? 0;
    const nb = countBySnapshot.get(b.id) ?? 0;
    if (na === 0 && nb > 0) return 1;
    if (nb === 0 && na > 0) return -1;
    if (na === 0 && nb === 0) {
      const d = fitScore(b, buyer) - fitScore(a, buyer);
      return d !== 0 ? d : b.created_at.localeCompare(a.created_at);
    }
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra == null && rb != null) return 1;
    if (ra != null && rb == null) return -1;
    if (ra != null && rb != null && ra !== rb) return rb - ra;
    if (na !== nb) return nb - na;
    return b.created_at.localeCompare(a.created_at);
  });

  const pages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
  const pageIdx = Math.min(parsed.data.page, pages);
  const slice = ranked.slice((pageIdx - 1) * PAGE_SIZE, pageIdx * PAGE_SIZE);

  if (pageIdx === 1) {
    await admin.from("query_events").insert({
      user_id: user.id,
      raw_query: parsed.data.text,
      filters: interpreted.filters as unknown as Record<string, unknown>,
      result_count: ranked.length,
    });
  }

  // Exposure first. Each row's exposure must be durable before any crowd figure is returned.
  for (const s of slice) {
    if (mine.exposed.has(s.business_id)) continue;
    const { error } = await admin.rpc("record_exposure", { p_user: user.id, p_business: s.business_id, p_snapshot: s.id, p_surface: "find_deals_row" });
    if (error) {
      console.error("record_exposure failed", error);
      return { status: "invalid", message: "Could not record this view. Try the search again." };
    }
  }

  const rows: DealRow[] = await Promise.all(
    slice.map(async (s) => {
      const src = sources.get(s.source_domain) ?? null;
      const stats = await loadCrowdStats(s);
      return {
        businessId: s.business_id,
        snapshotId: s.id,
        headline: s.headline,
        industry: s.industry,
        location: [s.region, s.state, s.metro].filter(Boolean).join(" · ") || "Location not stated",
        state: s.state,
        snapshotDate: s.snapshot_date,
        revenue: s.revenue,
        earnings: s.earnings,
        earningsType: s.earnings_type,
        askingPrice: stats.askingPrice,
        nInd: stats.nCount,
        evidence: stats.evidence,
        medianEv: stats.medianEv,
        medianToAsk: stats.medianToAsk,
        prAboveAsk: stats.prAboveAsk,
        alreadyUnlocked: mine.unlocked.has(s.business_id),
        selfSubmitted: mine.selfSubmitted.has(s.business_id),
        publisher: src?.publisher ?? null,
        attributionText: src?.attribution_text ?? null,
        fit: fitScore(s, buyer),
      };
    }),
  );

  revalidatePath("/value");
  return { status: "ok", count: ranked.length, page: pageIdx, pages, chips: interpreted.chips, rows, source: interpreted.source, balance };
}

export type RevealUrlResult =
  | { status: "charged" | "free" | "already_unlocked" | "self_submitted"; url: string; charged: boolean; balance: number }
  | { status: "insufficient" | "removed" | "no_url" | "not_found" | "rate_limited" | "invalid"; message: string; balance: number };

/** Reveal the source URL: free below 3 independent valuations, 1 point from 3 on; once per business. */
export async function revealUrlAction(businessId: string): Promise<RevealUrlResult> {
  const { user, balance } = await requireMember();
  if (!z.string().uuid().safeParse(businessId).success) return { status: "invalid", message: "Unknown business.", balance };
  const { data, error } = await supabaseAdmin().rpc("reveal_url", { p_user: user.id, p_business: businessId });
  if (error) {
    console.error("reveal_url failed", error);
    return { status: "invalid", message: "Could not open the broker listing. Try again.", balance };
  }
  const row = (data as Array<{ url: string | null; charged: boolean; balance: number; status: string }>)[0];
  if (!row) return { status: "not_found", message: "This listing is no longer available.", balance };
  const newBalance = Number(row.balance ?? balance);
  switch (row.status) {
    case "charged":
    case "free":
    case "already_unlocked":
    case "self_submitted":
      revalidatePath("/unlocked");
      revalidatePath("/points");
      return { status: row.status, url: row.url ?? "", charged: Boolean(row.charged), balance: newBalance };
    case "insufficient":
      return { status: "insufficient", message: "Your balance is below 1 point. Value a business to earn more, then come back.", balance: newBalance };
    case "removed":
      return { status: "removed", message: "This listing was removed at the publisher's request.", balance: newBalance };
    case "rate_limited":
      return { status: "rate_limited", message: "You have opened the most free broker listings allowed today. Try again tomorrow.", balance: newBalance };
    case "no_url":
      return { status: "no_url", message: "No broker listing link is stored for this business.", balance: newBalance };
    default:
      return { status: "not_found", message: "This listing is no longer available.", balance: newBalance };
  }
}
