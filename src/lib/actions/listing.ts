"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { acceptTerms, hasAcceptedTerms, requireMember } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateSubmittedUrl, createSnapshotFromSubmission, type ValidationResult, type ExtractedFacts } from "@/lib/sources";
import { normalizeUrl } from "@/lib/sources/normalize";
import { sealForecast, valuationQuestion } from "@/lib/quant/service";
import { allBounds } from "@/lib/quant/model";
import type { ListingSnapshot } from "@/lib/domain/types";
import { forecastRateLimited, optStr, parseMoney, str, triState } from "./guards";

/** Client-safe projection of the validation result (never leaks source_url of other users' listings). */
export type ValidateUrlResult =
  | { status: "blocked"; message: string; domain: string }
  | { status: "invalid"; message: string }
  | { status: "unknown_source"; message: string; domain: string; url: string }
  | {
      status: "existing";
      businessId: string;
      snapshotId: string;
      exposed: boolean;
      alreadyValued: boolean;
      snapshot: ListingSnapshot;
      message: string;
      contractToken: string | null;
      bounds: ReturnType<typeof allBounds> | null;
      nCount: number;
    }
  | {
      status: "new";
      url: string;
      domain: string;
      publisher: string | null;
      facts: ExtractedFacts;
      fetchError?: string;
      bounds: ReturnType<typeof allBounds>;
    };

export async function validateUrlAction(raw: string): Promise<ValidateUrlResult> {
  const { user } = await requireMember();
  const parsed = z.string().trim().min(1).max(2048).safeParse(raw ?? "");
  if (!parsed.success) return { status: "invalid", message: "Paste the listing URL first." };

  let result: ValidationResult;
  try {
    result = await validateSubmittedUrl(parsed.data, user.id);
  } catch (err) {
    console.error("validateSubmittedUrl failed", err);
    return { status: "invalid", message: "Could not check that URL right now. Try again in a moment." };
  }

  switch (result.status) {
    case "blocked":
      return { status: "blocked", message: result.message, domain: result.domain };
    case "invalid":
      return { status: "invalid", message: result.message };
    case "unknown_source":
      return { status: "unknown_source", message: result.message, domain: result.domain, url: result.url };
    case "existing": {
      const q = !result.exposed && !result.alreadyValued ? await valuationQuestion(result.snapshotId) : null;
      return {
        status: "existing",
        businessId: result.businessId,
        snapshotId: result.snapshotId,
        exposed: result.exposed,
        alreadyValued: result.alreadyValued,
        snapshot: result.snapshot,
        message: result.message,
        contractToken: q?.contractToken ?? null,
        bounds: q?.bounds ?? null,
        nCount: q?.nCount ?? 0,
      };
    }
    case "new":
      return {
        status: "new",
        url: result.url,
        domain: result.domain,
        publisher: result.rights.publisher,
        facts: result.facts,
        fetchError: result.fetchError,
        bounds: allBounds(0),
      };
  }
}

export type RequestSourceReviewResult = { status: "ok"; message: string } | { status: "invalid"; message: string };

/** Unknown domain: store a rights-review request. Nothing is fetched and no snapshot is created. */
export async function requestSourceReviewAction(raw: string): Promise<RequestSourceReviewResult> {
  const { user } = await requireMember();
  const n = normalizeUrl(raw ?? "");
  if (!n.ok) return { status: "invalid", message: n.reason };
  const admin = supabaseAdmin();
  const { error } = await admin.from("source_submissions").insert({
    user_id: user.id,
    submitted_url: String(raw).trim().slice(0, 2048),
    normalized_url: n.url,
    domain: n.domain,
    status: "pending_review",
    reason: "unknown_source: rights review requested",
  });
  if (error) {
    console.error("source_submissions insert failed", error);
    return { status: "invalid", message: "Could not record the request. Try again." };
  }
  await admin.from("source_domains").upsert({ domain: n.domain, status: "review" }, { onConflict: "domain", ignoreDuplicates: true });
  return { status: "ok", message: `Thanks. ${n.domain} is queued for a rights review. Nothing was fetched, and you will be able to value listings from it once it is cleared.` };
}

const listingSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  headline: z.string().trim().min(2).max(80),
  industry: z.string().trim().min(2).max(80),
  tags: z.array(z.string().trim().min(1).max(30)).max(12),
  state: z.string().trim().length(2).toUpperCase().nullable(),
  metro: z.string().trim().max(80).nullable(),
  askingPrice: z.number().int().positive().max(1e11).nullable(),
  revenue: z.number().int().positive().max(1e11).nullable(),
  revenuePeriod: z.string().trim().max(30).nullable(),
  earnings: z.number().int().positive().max(1e11).nullable(),
  earningsType: z.enum(["sde", "ebitda", "seller_cash_flow", "unknown"]),
  includesInventory: z.boolean().nullable(),
  includesNwc: z.boolean().nullable(),
  includesRealEstate: z.boolean().nullable(),
  dealTermsNote: z.string().trim().max(500).nullable(),
  withValuation: z.boolean(),
  value: z.number().int().positive().max(1e11).nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  rationale: z.string().trim().max(500).nullable(),
  acceptTerms: z.boolean(),
  extracted: z.string().max(200_000).nullable(),
  listingTitleRaw: z.string().trim().max(300).nullable(),
});

export type SubmitListingResult =
  | { status: "approved"; snapshotId: string; businessId: string; valuation: "sealed" | "not_requested" | "failed"; valuationMessage?: string; maxGain?: number; maxLoss?: number }
  | { status: "pending_review"; snapshotId: string; businessId: string; message: string }
  | { status: "duplicate"; snapshotId: string; businessId: string; message: string }
  | { status: "terms_required" | "invalid" | "rate_limited" | "blocked"; message: string };

/**
 * Create the listing snapshot (approved or pending review per source rights), then seal the
 * optional valuation only when the snapshot is approved. URL-only never earns points.
 */
export async function submitListingAction(formData: FormData): Promise<SubmitListingResult> {
  const { user, profile } = await requireMember();

  const tags = str(formData, "tags")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const withValuation = str(formData, "withValuation") === "1";
  const parsed = listingSchema.safeParse({
    url: str(formData, "url"),
    headline: str(formData, "headline"),
    industry: str(formData, "industry"),
    tags,
    state: optStr(formData, "state"),
    metro: optStr(formData, "metro"),
    askingPrice: parseMoney(str(formData, "askingPrice")),
    revenue: parseMoney(str(formData, "revenue")),
    revenuePeriod: optStr(formData, "revenuePeriod"),
    earnings: parseMoney(str(formData, "earnings")),
    earningsType: str(formData, "earningsType") || "unknown",
    includesInventory: triState(formData, "includesInventory"),
    includesNwc: triState(formData, "includesNwc"),
    includesRealEstate: triState(formData, "includesRealEstate"),
    dealTermsNote: optStr(formData, "dealTermsNote"),
    withValuation,
    value: withValuation ? parseMoney(str(formData, "value")) : null,
    confidence: withValuation ? str(formData, "confidence") || null : null,
    rationale: optStr(formData, "rationale"),
    acceptTerms: str(formData, "acceptTerms") === "on" || str(formData, "acceptTerms") === "true",
    extracted: optStr(formData, "extracted"),
    listingTitleRaw: optStr(formData, "listingTitleRaw"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = String(first?.path[0] ?? "");
    const friendly: Record<string, string> = {
      headline: "Give the listing a short neutral headline (2 to 80 characters).",
      industry: "Enter the industry.",
      state: "Use the two-letter state code, or leave it blank.",
      value: "Enter a positive enterprise value for your valuation.",
      confidence: "Pick a confidence level for your valuation.",
    };
    return { status: "invalid", message: friendly[field] ?? "Check the form and try again." };
  }
  const input = parsed.data;
  if (input.withValuation && (!input.value || !input.confidence)) {
    return { status: "invalid", message: "Enter an enterprise value and pick a confidence, or choose Submit URL only." };
  }

  // Terms acknowledgement before the first contribution (URL or valuation).
  if (!hasAcceptedTerms(profile)) {
    if (!input.acceptTerms) return { status: "terms_required", message: "Acknowledge the contribution terms before your first submission." };
    await acceptTerms(user.id);
  }
  if (input.withValuation && (await forecastRateLimited(user.id))) {
    return { status: "rate_limited", message: "You have reached the limit of 20 valuations in 24 hours. You can still submit the URL only." };
  }

  // Re-validate the URL server side: blocked domains never proceed, even if the client lied.
  let validation: ValidationResult;
  try {
    validation = await validateSubmittedUrl(input.url, user.id);
  } catch (err) {
    console.error("validateSubmittedUrl failed", err);
    return { status: "invalid", message: "Could not check that URL right now. Try again in a moment." };
  }
  if (validation.status === "blocked") return { status: "blocked", message: validation.message };
  if (validation.status === "invalid") return { status: "invalid", message: validation.message };
  if (validation.status === "unknown_source") return { status: "invalid", message: "This source has not been cleared yet. Request a rights review instead." };
  if (validation.status === "existing") {
    return { status: "duplicate", snapshotId: validation.snapshotId, businessId: validation.businessId, message: "This listing is already on PriceAFirm." };
  }

  let extracted: ExtractedFacts | null = null;
  if (input.extracted) {
    try {
      extracted = JSON.parse(input.extracted) as ExtractedFacts;
    } catch {
      extracted = validation.facts;
    }
  } else {
    extracted = validation.facts;
  }

  let created;
  try {
    created = await createSnapshotFromSubmission({
      userId: user.id,
      url: validation.url,
      domain: validation.domain,
      canonicalKey: validation.canonicalKey,
      facts: {
        headline: input.headline,
        industry: input.industry,
        industryTags: input.tags,
        state: input.state,
        metro: input.metro,
        askingPrice: input.askingPrice,
        askBasis: "ev",
        revenue: input.revenue,
        revenuePeriod: input.revenuePeriod,
        earnings: input.earnings,
        earningsType: input.earningsType,
        includesInventory: input.includesInventory,
        includesNwc: input.includesNwc,
        includesRealEstate: input.includesRealEstate,
        dealTermsNote: input.dealTermsNote,
      },
      extracted,
      listingTitleRaw: input.listingTitleRaw ?? extracted?.title ?? null,
    });
  } catch (err) {
    console.error("createSnapshotFromSubmission failed", err);
    return { status: "invalid", message: "Could not save the listing. Try again in a moment." };
  }

  revalidatePath("/value");
  revalidatePath("/admin");

  if (created.status === "duplicate") {
    return { status: "duplicate", snapshotId: created.snapshotId, businessId: created.businessId, message: "This listing is already on PriceAFirm." };
  }
  if (created.status === "pending_review") {
    return {
      status: "pending_review",
      snapshotId: created.snapshotId,
      businessId: created.businessId,
      message: input.withValuation
        ? "The listing is saved and awaits review. Your valuation was not recorded; you can value it once it is approved, and we will not show you any crowd figures for it in the meantime."
        : "The listing is saved and awaits review. You can value it once it is approved.",
    };
  }

  if (!input.withValuation || !input.value || !input.confidence) {
    return { status: "approved", snapshotId: created.snapshotId, businessId: created.businessId, valuation: "not_requested" };
  }

  const q = await valuationQuestion(created.snapshotId);
  if (!q) {
    return { status: "approved", snapshotId: created.snapshotId, businessId: created.businessId, valuation: "failed", valuationMessage: "The listing was saved but is not open for valuation yet." };
  }
  try {
    const sealed = await sealForecast({
      userId: user.id,
      snapshotId: created.snapshotId,
      value: input.value,
      confidence: input.confidence,
      contractToken: q.contractToken,
      rationale: input.rationale,
    });
    revalidatePath("/points");
    if (sealed.status === "sealed") {
      return { status: "approved", snapshotId: created.snapshotId, businessId: created.businessId, valuation: "sealed", maxGain: sealed.bounds.maxGain, maxLoss: sealed.bounds.maxLoss };
    }
    const msg = sealed.status === "bounds_changed" ? "The point range changed before sealing. Open the listing to value it with the current range." : sealed.message;
    return { status: "approved", snapshotId: created.snapshotId, businessId: created.businessId, valuation: "failed", valuationMessage: msg };
  } catch (err) {
    console.error("sealForecast failed", err);
    return { status: "approved", snapshotId: created.snapshotId, businessId: created.businessId, valuation: "failed", valuationMessage: "The listing was saved but the valuation could not be recorded. Open the listing to try again." };
  }
}
