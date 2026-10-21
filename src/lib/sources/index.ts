import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ListingSnapshot, SourceDomain } from "@/lib/domain/types";
import { isBlockedDomain, normalizeUrl, urlHash } from "./normalize";
import { safeFetch } from "./safeFetch";
import { extractListingFacts, type ExtractedFacts } from "./extract";
import { regionForState } from "./usStates";

export { normalizeUrl, isBlockedDomain, urlHash } from "./normalize";
export { extractListingFacts, type ExtractedFacts } from "./extract";
export { regionForState, stateCode, US_STATES, REGIONS } from "./usStates";

/**
 * URL ingestion (design v2.2, Section 9): permissionless sources with removal on complaint.
 * normalize -> hard exclusion list -> source check (blocked / removed / allowed) -> dedupe ->
 * safe fetch + extraction -> snapshot creation. The hard exclusion list (BizBuySell, BizQuest) is
 * checked before any database or network call and those domains are never fetched.
 */

export type SourceStatus = "allowed" | "blocked" | "removed";

export interface SourceCheck {
  status: SourceStatus;
  source: SourceDomain | null;
  message: string;
}

const BLOCKED_MESSAGE = "This source is on PriceAFirm's excluded list. URLs from it are not accepted.";
const REMOVED_MESSAGE = "This source asked to be removed from PriceAFirm. URLs from it are no longer accepted.";

function rowToSource(row: Record<string, unknown>): SourceDomain {
  return {
    domain: String(row.domain),
    status: row.status as SourceDomain["status"],
    source_type: (row.source_type as SourceDomain["source_type"]) ?? "third_party",
    publisher: (row.publisher as string | null) ?? null,
    attribution_text: (row.attribution_text as string | null) ?? null,
    complaint_received_at: (row.complaint_received_at as string | null) ?? null,
    removed_at: (row.removed_at as string | null) ?? null,
    removal_reason: (row.removal_reason as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
}

function cleanDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

/** Blocked if on the hard list or excluded in the table; removed if a complaint took it down; otherwise allowed. */
export async function checkSource(domain: string): Promise<SourceCheck> {
  const d = cleanDomain(domain);
  if (isBlockedDomain(d)) return { status: "blocked", source: null, message: BLOCKED_MESSAGE };
  const { data, error } = await supabaseAdmin().from("source_domains").select("*").eq("domain", d).maybeSingle();
  if (error) throw error;
  if (!data) return { status: "allowed", source: null, message: "New source; it will be recorded on first submission." };
  const source = rowToSource(data as Record<string, unknown>);
  if (source.status === "blocked" || source.source_type === "excluded") return { status: "blocked", source, message: BLOCKED_MESSAGE };
  if (source.removed_at) return { status: "removed", source, message: REMOVED_MESSAGE };
  return { status: "allowed", source, message: source.source_type === "operator" ? "Operator source." : "Third-party source." };
}

/** Upsert the source_domains row for an allowed domain (status allowed, third_party, first_seen now) and return it. */
async function ensureSourceRow(domain: string, existing: SourceDomain | null): Promise<SourceDomain> {
  if (existing) return existing;
  const db = supabaseAdmin();
  const { error } = await db
    .from("source_domains")
    .upsert({ domain, status: "allowed", source_type: "third_party", first_seen: new Date().toISOString() }, { onConflict: "domain", ignoreDuplicates: true });
  if (error) throw error;
  const { data } = await db.from("source_domains").select("*").eq("domain", domain).maybeSingle();
  if (!data) throw new Error(`Could not record source ${domain}`);
  return rowToSource(data as Record<string, unknown>);
}

export type ValidationResult =
  | { status: "blocked"; message: string; domain: string }
  | { status: "invalid"; message: string }
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
      source: SourceDomain;
      facts: ExtractedFacts;
      /** Set only when the fetch failed; the user then enters facts manually. */
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

async function latestSnapshot(businessId: string): Promise<ListingSnapshot | null> {
  const db = supabaseAdmin();
  const approved = await db
    .from("listing_snapshots")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (approved.data) return approved.data as ListingSnapshot;
  const any = await db
    .from("listing_snapshots")
    .select("*")
    .eq("business_id", businessId)
    .neq("status", "withdrawn")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (any.data as ListingSnapshot | null) ?? null;
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
  const submittedUrl = raw.trim().slice(0, 2048);

  // Hard exclusion before any database or network access.
  if (isBlockedDomain(domain)) {
    await logSubmission({ user_id: userId, submitted_url: submittedUrl, normalized_url: url, domain, status: "rejected", reason: "blocked_domain" });
    return { status: "blocked", message: BLOCKED_MESSAGE, domain };
  }

  const check = await checkSource(domain);
  if (check.status !== "allowed") {
    await logSubmission({
      user_id: userId,
      submitted_url: submittedUrl,
      normalized_url: url,
      domain,
      status: "rejected",
      reason: check.status === "removed" ? "source_removed" : "source_blocked",
    });
    return { status: "blocked", message: check.message, domain };
  }

  // Dedupe before fetching so a known business is never re-fetched.
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

  const source = await ensureSourceRow(domain, check.source);
  const fetched = await safeFetch(url, domain);
  if (!fetched.ok) return { status: "new", url, domain, canonicalKey, source, facts: EMPTY_FACTS, fetchError: fetched.reason };
  return { status: "new", url, domain, canonicalKey, source, facts: extractListingFacts(fetched.html, fetched.finalUrl) };
}

export interface SubmissionFacts {
  headline: string;
  industry: string;
  industryTags?: string[];
  region?: string | null;
  state?: string | null;
  metro?: string | null;
  askingPrice?: number | null;
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
  /** Facts from the fetch; null when the fetch failed and the user entered everything manually. */
  extracted: ExtractedFacts | null;
  /** The fetch error from validateSubmittedUrl, when there was one. Triggers pending_review. */
  fetchError?: string | null;
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
  const { userId, url, canonicalKey, facts, extracted } = input;
  const domain = cleanDomain(input.domain);
  const submittedUrl = url.slice(0, 2048);

  const check = await checkSource(domain);
  if (check.status !== "allowed") throw new Error(`Source ${domain} is ${check.status} and cannot be stored`);
  const source = await ensureSourceRow(domain, check.source);

  // Business: reuse on canonical_key conflict.
  const upsertBiz = await db.from("businesses").upsert({ canonical_key: canonicalKey }, { onConflict: "canonical_key", ignoreDuplicates: false }).select("id").single();
  if (upsertBiz.error || !upsertBiz.data) throw upsertBiz.error ?? new Error("Could not create business");
  const businessId = (upsertBiz.data as { id: string }).id;

  const duplicate = async (snapshotId: string): Promise<CreateSnapshotResult> => {
    await logSubmission({
      user_id: userId,
      submitted_url: submittedUrl,
      normalized_url: url,
      domain,
      status: "duplicate",
      reason: "snapshot_exists",
      business_id: businessId,
      snapshot_id: snapshotId,
    });
    return { status: "duplicate", businessId, snapshotId };
  };

  const existing = await latestSnapshot(businessId);
  if (existing) return duplicate(existing.id);

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
    revenue: num(facts.revenue),
    revenue_period: clean(facts.revenuePeriod, 40),
    earnings,
    earnings_type: earnings != null ? (facts.earningsType ?? "unknown") : "unknown",
    includes_inventory: facts.includesInventory ?? null,
    includes_nwc: facts.includesNwc ?? null,
    includes_real_estate: facts.includesRealEstate ?? null,
    deal_terms_note: clean(facts.dealTermsNote, 500),
  };

  // Approved whenever the source is live (operator or third_party, not removed). Manual entry after a failed
  // fetch is the only path that waits for review.
  const manualEntry = Boolean(input.fetchError) || extracted == null;
  const live = (source.source_type === "operator" || source.source_type === "third_party") && !source.removed_at;
  const status: "approved" | "pending_review" = live && !manualEntry ? "approved" : "pending_review";

  const snapInsert = await db
    .from("listing_snapshots")
    .insert({
      ...stored,
      independent_count: 0,
      content_hash: contentHash(stored),
      status,
      submitted_by: userId,
      approved_at: status === "approved" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (snapInsert.error || !snapInsert.data) {
    // A concurrent submission may have won the (business_id, version) race.
    const raced = await latestSnapshot(businessId);
    if (raced) return duplicate(raced.id);
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
    : { fetchError: input.fetchError ?? "not fetched" };

  const srcInsert = await db.from("listing_sources").insert({
    snapshot_id: snapshotId,
    source_url: url,
    source_url_hash: urlHash(url),
    broker_name: source.publisher ?? domain,
    listing_title_raw: clean(input.listingTitleRaw ?? extracted?.title ?? null, 300),
    extracted: extractedJson,
    fetched_at: extracted ? new Date().toISOString() : null,
  });
  if (srcInsert.error) throw srcInsert.error;

  await logSubmission({
    user_id: userId,
    submitted_url: submittedUrl,
    normalized_url: url,
    domain,
    status,
    reason: status === "approved" ? null : manualEntry ? "manual_entry_after_fetch_failure" : "source_not_live",
    business_id: businessId,
    snapshot_id: snapshotId,
  });

  return { status, businessId, snapshotId };
}
