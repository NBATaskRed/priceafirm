import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ListingSnapshot, SourceRights } from "@/lib/domain/types";
import { isBlockedDomain, normalizeUrl, urlHash } from "./normalize";
import { safeFetch } from "./safeFetch";
import { extractListingFacts, type ExtractedFacts } from "./extract";
import { regionForState } from "./usStates";

export { normalizeUrl, isBlockedDomain, urlHash } from "./normalize";
export { extractListingFacts, type ExtractedFacts } from "./extract";
export { regionForState, stateCode, US_STATES, REGIONS } from "./usStates";

/**
 * URL ingestion (design Section 9): normalize -> hard blocklist -> rights check -> dedupe ->
 * safe fetch + extraction -> snapshot creation. Blocked domains are rejected before any database
 * or network call, and BizBuySell / BizQuest are never fetched.
 */

export type SourceStatus = "allowed" | "blocked" | "review" | "unknown";

export interface SourceCheck {
  status: SourceStatus;
  rights: SourceRights | null;
  message: string;
}

const BLOCKED_MESSAGE = "This source does not permit listing data to be fetched or stored. PriceAFirm does not accept URLs from it.";

function rowToRights(row: Record<string, unknown>): SourceRights {
  return {
    domain: String(row.domain),
    status: row.status as SourceRights["status"],
    publisher: (row.publisher as string | null) ?? null,
    may_fetch: Boolean(row.may_fetch),
    may_store: Boolean(row.may_store),
    may_display_ask: Boolean(row.may_display_ask),
    may_display_ev_to_ask: Boolean(row.may_display_ev_to_ask),
    may_show_anonymous_preview: Boolean(row.may_show_anonymous_preview),
    may_link_original_listing: Boolean(row.may_link_original_listing),
    attribution_required: Boolean(row.attribution_required),
    revoked_at: (row.revoked_at as string | null) ?? null,
  };
}

export async function checkSource(domain: string): Promise<SourceCheck> {
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  if (isBlockedDomain(d)) {
    return { status: "blocked", rights: null, message: BLOCKED_MESSAGE };
  }
  const { data, error } = await supabaseAdmin().from("source_domains").select("*").eq("domain", d).maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      status: "unknown",
      rights: null,
      message: `${d} has not been reviewed yet. You can submit the URL for a rights review; nothing will be fetched until an admin approves the source.`,
    };
  }
  const rights = rowToRights(data as Record<string, unknown>);
  if (rights.status === "blocked" || rights.revoked_at) {
    return { status: "blocked", rights, message: BLOCKED_MESSAGE };
  }
  if (rights.status === "review") {
    return {
      status: "review",
      rights,
      message: `${d} is under rights review. You can submit the URL; it will be held until the review completes.`,
    };
  }
  return { status: "allowed", rights, message: rights.may_fetch ? "Approved source." : "Approved source (manual entry only)." };
}

export type ValidationResult =
  | { status: "blocked"; message: string; domain: string }
  | { status: "invalid"; message: string }
  | { status: "unknown_source"; message: string; domain: string; url: string; canonicalKey: string }
  | {
      status: "existing";
      businessId: string;
      snapshotId: string;
      exposed: boolean;
      alreadyValued: boolean;
      snapshot: ListingSnapshot;
      message: string;
    }
  | {
      status: "new";
      url: string;
      domain: string;
      canonicalKey: string;
      rights: SourceRights;
      facts: ExtractedFacts;
      fetchError?: string;
    };

const EMPTY_FACTS: ExtractedFacts = { fields: {}, quality: "low" };

async function logSubmission(row: {
  user_id: string;
  submitted_url: string;
  normalized_url?: string | null;
  domain?: string | null;
  status: "rejected" | "pending_review" | "approved" | "duplicate";
  reason?: string | null;
  business_id?: string | null;
  snapshot_id?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("source_submissions").insert(row);
  if (error) throw error;
}

async function latestSnapshot(businessId: string, preferApproved = true): Promise<ListingSnapshot | null> {
  const db = supabaseAdmin();
  if (preferApproved) {
    const { data } = await db
      .from("listing_snapshots")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "approved")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as ListingSnapshot;
  }
  const { data } = await db
    .from("listing_snapshots")
    .select("*")
    .eq("business_id", businessId)
    .neq("status", "withdrawn")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ListingSnapshot | null) ?? null;
}

async function findExistingBusiness(urlHashValue: string, canonicalKey: string): Promise<string | null> {
  const db = supabaseAdmin();
  const bySource = await db.from("listing_sources").select("snapshot_id").eq("source_url_hash", urlHashValue).limit(1).maybeSingle();
  if (bySource.data) {
    const snapshotId = (bySource.data as { snapshot_id: string }).snapshot_id;
    const snap = await db.from("listing_snapshots").select("business_id").eq("id", snapshotId).maybeSingle();
    if (snap.data) return (snap.data as { business_id: string }).business_id;
  }
  const byKey = await db.from("businesses").select("id").eq("canonical_key", canonicalKey).maybeSingle();
  if (byKey.data) return (byKey.data as { id: string }).id;
  return null;
}

export async function validateSubmittedUrl(raw: string, userId: string): Promise<ValidationResult> {
  const norm = normalizeUrl(raw);
  if (!norm.ok) return { status: "invalid", message: norm.reason };
  const { url, domain, canonicalKey } = norm;

  // Hard block before any database or network access.
  if (isBlockedDomain(domain)) {
    await logSubmission({
      user_id: userId,
      submitted_url: raw.trim().slice(0, 2048),
      normalized_url: url,
      domain,
      status: "rejected",
      reason: "blocked_domain",
    });
    return { status: "blocked", message: BLOCKED_MESSAGE, domain };
  }

  const source = await checkSource(domain);
  if (source.status === "blocked") {
    await logSubmission({
      user_id: userId,
      submitted_url: raw.trim().slice(0, 2048),
      normalized_url: url,
      domain,
      status: "rejected",
      reason: source.rights?.revoked_at ? "source_revoked" : "source_blocked",
    });
    return { status: "blocked", message: source.message, domain };
  }

  // Dedupe before anything else so a known business is never re-fetched.
  const existingBusinessId = await findExistingBusiness(urlHash(url), canonicalKey);
  if (existingBusinessId) {
    const snapshot = await latestSnapshot(existingBusinessId);
    if (snapshot) {
      const db = supabaseAdmin();
      const [exposedRes, forecastRes] = await Promise.all([
        db.rpc("is_exposed", { p_user: userId, p_business: existingBusinessId }),
        db.from("forecast_submissions").select("id").eq("user_id", userId).eq("business_id", existingBusinessId).limit(1).maybeSingle(),
      ]);
      const exposed = Boolean(exposedRes.data);
      const alreadyValued = Boolean(forecastRes.data);
      let message = "This listing is already on PriceAFirm.";
      if (alreadyValued) message += " You have already valued it.";
      else if (exposed) message += " You have seen PriceAFirm value information for it, so a scored valuation is not available.";
      else if (snapshot.status === "approved") message += " You can value it now.";
      else message += " It is awaiting review.";
      return { status: "existing", businessId: existingBusinessId, snapshotId: snapshot.id, exposed, alreadyValued, snapshot, message };
    }
  }

  if (source.status === "unknown" || source.status === "review" || !source.rights) {
    return { status: "unknown_source", message: source.message, domain, url, canonicalKey };
  }

  const rights = source.rights;
  if (!rights.may_fetch) {
    return { status: "new", url, domain, canonicalKey, rights, facts: EMPTY_FACTS, fetchError: "Source approved for manual entry only" };
  }

  const fetched = await safeFetch(url, domain);
  if (!fetched.ok) {
    return { status: "new", url, domain, canonicalKey, rights, facts: EMPTY_FACTS, fetchError: fetched.reason };
  }
  const facts = extractListingFacts(fetched.html, fetched.finalUrl);
  return { status: "new", url, domain, canonicalKey, rights, facts };
}

export interface SubmissionFacts {
  headline: string;
  industry: string;
  industryTags?: string[];
  region?: string | null;
  state?: string | null;
  metro?: string | null;
  askingPrice?: number | null;
  askBasis?: "ev" | "equity" | "assets" | "unknown";
  revenue?: number | null;
  revenuePeriod?: string | null;
  earnings?: number | null;
  earningsType?: "sde" | "ebitda" | "seller_cash_flow" | "unknown";
  includesInventory?: boolean | null;
  includesNwc?: boolean | null;
  includesRealEstate?: boolean | null;
  dealTermsNote?: string | null;
}

export interface CreateSnapshotInput {
  userId: string;
  url: string;
  domain: string;
  canonicalKey: string;
  facts: SubmissionFacts;
  extracted: ExtractedFacts | null;
  listingTitleRaw?: string | null;
}

export type CreateSnapshotResult = { status: "approved" | "pending_review" | "duplicate"; businessId: string; snapshotId: string };

function contentHash(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj), "utf8").digest("hex");
}

function clean(s: string | null | undefined, max = 200): string | null {
  if (s == null) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function num(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export async function createSnapshotFromSubmission(input: CreateSnapshotInput): Promise<CreateSnapshotResult> {
  const db = supabaseAdmin();
  const { userId, url, domain, canonicalKey, facts, extracted } = input;
  const submittedUrl = url.slice(0, 2048);

  if (isBlockedDomain(domain)) throw new Error("Blocked domain cannot be stored");

  // Rights decide approval.
  const source = await checkSource(domain);
  if (source.status === "blocked") throw new Error("Blocked domain cannot be stored");
  const rights = source.rights;

  // Ensure a source_domains row exists for the FK (unknown domains get a 'review' row).
  if (!rights) {
    const { error } = await db.from("source_domains").upsert({ domain, status: "review" }, { onConflict: "domain", ignoreDuplicates: true });
    if (error) throw error;
  }

  // Business: reuse on canonical_key conflict.
  const upsertBiz = await db.from("businesses").upsert({ canonical_key: canonicalKey }, { onConflict: "canonical_key", ignoreDuplicates: false }).select("id").single();
  if (upsertBiz.error || !upsertBiz.data) throw upsertBiz.error ?? new Error("Could not create business");
  const businessId = (upsertBiz.data as { id: string }).id;

  // Duplicate: a live snapshot already exists for this business.
  const existing = await latestSnapshot(businessId);
  if (existing) {
    await logSubmission({
      user_id: userId,
      submitted_url: submittedUrl,
      normalized_url: url,
      domain,
      status: "duplicate",
      reason: "snapshot_exists",
      business_id: businessId,
      snapshot_id: existing.id,
    });
    return { status: "duplicate", businessId, snapshotId: existing.id };
  }

  const state = facts.state ? facts.state.trim().toUpperCase().slice(0, 2) : null;
  const region = clean(facts.region) ?? (state ? regionForState(state) : null);
  const industryTags = Array.from(new Set((facts.industryTags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)));
  const earnings = num(facts.earnings);

  const stored = {
    business_id: businessId,
    version: 1,
    source_domain: domain,
    headline: clean(facts.headline, 120) ?? clean(facts.industry, 120) ?? "Business for sale",
    industry: clean(facts.industry, 80) ?? "unknown",
    industry_tags: industryTags,
    region,
    state,
    metro: clean(facts.metro, 80),
    asking_price: num(facts.askingPrice),
    ask_currency: "USD",
    ask_basis: facts.askBasis ?? "unknown",
    revenue: num(facts.revenue),
    revenue_period: clean(facts.revenuePeriod, 40),
    earnings,
    earnings_type: earnings != null ? (facts.earningsType ?? "unknown") : "unknown",
    includes_inventory: facts.includesInventory ?? null,
    includes_nwc: facts.includesNwc ?? null,
    includes_real_estate: facts.includesRealEstate ?? null,
    deal_terms_note: clean(facts.dealTermsNote, 500),
  };

  const approved = Boolean(rights && rights.status === "allowed" && rights.may_store && !rights.revoked_at);
  const status: "approved" | "pending_review" = approved ? "approved" : "pending_review";

  const snapInsert = await db
    .from("listing_snapshots")
    .insert({
      ...stored,
      content_hash: contentHash(stored),
      status,
      submitted_by: userId,
      approved_at: approved ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (snapInsert.error || !snapInsert.data) {
    // A concurrent submission may have won the (business_id, version) race; treat as duplicate.
    const raced = await latestSnapshot(businessId);
    if (raced) {
      await logSubmission({
        user_id: userId,
        submitted_url: submittedUrl,
        normalized_url: url,
        domain,
        status: "duplicate",
        reason: "snapshot_exists",
        business_id: businessId,
        snapshot_id: raced.id,
      });
      return { status: "duplicate", businessId, snapshotId: raced.id };
    }
    throw snapInsert.error ?? new Error("Could not create snapshot");
  }
  const snapshotId = (snapInsert.data as { id: string }).id;

  const extractedJson = extracted
    ? {
        fields: extracted.fields,
        quality: extracted.quality,
        industry: extracted.industry ?? null,
        state: extracted.state ?? null,
        metro: extracted.metro ?? null,
        askingPrice: extracted.askingPrice ?? null,
        revenue: extracted.revenue ?? null,
        earnings: extracted.earnings ?? null,
        earningsType: extracted.earningsType ?? null,
        includesInventory: extracted.includesInventory ?? null,
        includesRealEstate: extracted.includesRealEstate ?? null,
      }
    : {};

  const srcInsert = await db.from("listing_sources").insert({
    snapshot_id: snapshotId,
    source_url: url,
    source_url_hash: urlHash(url),
    broker_name: rights?.publisher ?? null,
    listing_title_raw: clean(input.listingTitleRaw ?? extracted?.title ?? null, 300),
    extracted: extractedJson,
    fetched_at: extracted && Object.keys(extracted.fields).length ? new Date().toISOString() : null,
  });
  if (srcInsert.error) throw srcInsert.error;

  await logSubmission({
    user_id: userId,
    submitted_url: submittedUrl,
    normalized_url: url,
    domain,
    status,
    reason: approved ? null : rights ? "source_not_storable" : "source_unreviewed",
    business_id: businessId,
    snapshot_id: snapshotId,
  });

  return { status, businessId, snapshotId };
}
