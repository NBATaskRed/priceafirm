"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recomputeSnapshot, refreshAggregate } from "@/lib/quant/service";
import { isBlockedDomain, registrableDomain } from "@/lib/sources/normalize";
import { recomputeEverything } from "./recompute-core";
import { issueInvite, sendHeldInvites, sendInviteEmail } from "@/lib/invites/service";
import { inviteRequestSchema } from "@/lib/invites/token";
import { str } from "./guards";

export type AdminResult = { status: "ok"; message: string } | { status: "error"; message: string };

async function audit(actor: string, action: string, target: string | null, payload: Record<string, unknown> | null) {
  await supabaseAdmin().from("admin_audit").insert({ actor, action, target, payload });
}

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(/^[a-z0-9.-]+$/);

type SourceType = "operator" | "third_party" | "excluded";
const SOURCE_TYPES: SourceType[] = ["operator", "third_party", "excluded"];

/* ---------------------------------------------------------------- Sources */

export async function addSourceDomainAction(formData: FormData): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const raw = domainSchema.safeParse(str(formData, "domain").replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  if (!raw.success) return { status: "error", message: "Enter a bare domain like example.com." };
  const domain = registrableDomain(raw.data.replace(/^www\./, ""));
  const typeRaw = str(formData, "source_type");
  const source_type: SourceType = SOURCE_TYPES.includes(typeRaw as SourceType) ? (typeRaw as SourceType) : "third_party";
  if (isBlockedDomain(domain) && source_type !== "excluded") return { status: "error", message: `${domain} is hard-excluded in code; it can only be recorded as excluded.` };
  const publisher = str(formData, "publisher") || null;
  const attribution_text = str(formData, "attribution_text") || null;
  const { error } = await supabaseAdmin()
    .from("source_domains")
    .upsert({ domain, status: source_type === "excluded" ? "blocked" : "allowed", source_type, publisher, attribution_text }, { onConflict: "domain" });
  if (error) return { status: "error", message: error.message };
  await audit(user.id, "source_domain.add", domain, { source_type, publisher });
  revalidatePath("/admin");
  return { status: "ok", message: `${domain} recorded as ${source_type.replace("_", " ")}.` };
}

export async function setSourceTypeAction(domain: string, sourceType: string): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const d = domainSchema.safeParse(domain);
  if (!d.success || !SOURCE_TYPES.includes(sourceType as SourceType)) return { status: "error", message: "Invalid input." };
  if (isBlockedDomain(d.data) && sourceType !== "excluded") return { status: "error", message: `${d.data} is hard-excluded in code; it stays excluded.` };
  const { error } = await supabaseAdmin()
    .from("source_domains")
    .update({ source_type: sourceType, status: sourceType === "excluded" ? "blocked" : "allowed" })
    .eq("domain", d.data);
  if (error) return { status: "error", message: error.message };
  await audit(user.id, "source_domain.type", d.data, { source_type: sourceType });
  revalidatePath("/admin");
  revalidatePath("/value");
  return { status: "ok", message: `${d.data} is now ${sourceType.replace("_", " ")}.` };
}

export async function updateSourceAction(formData: FormData): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const d = domainSchema.safeParse(str(formData, "domain"));
  if (!d.success) return { status: "error", message: "Invalid domain." };
  const publisher = str(formData, "publisher") || null;
  const attribution_text = str(formData, "attribution_text") || null;
  const notes = str(formData, "notes") || null;
  const { error } = await supabaseAdmin().from("source_domains").update({ publisher, attribution_text, notes }).eq("domain", d.data);
  if (error) return { status: "error", message: error.message };
  await audit(user.id, "source_domain.update", d.data, { publisher, attribution_text, notes });
  revalidatePath("/admin");
  return { status: "ok", message: `${d.data} updated.` };
}

/** Removal on complaint: the source's listings stop being served, valued and revealed. */
export async function removeSourceAction(domain: string, reason: string): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const d = domainSchema.safeParse(domain);
  const r = z.string().trim().min(3).max(500).safeParse(reason ?? "");
  if (!d.success) return { status: "error", message: "Invalid domain." };
  if (!r.success) return { status: "error", message: "Give a short reason (who complained, when)." };
  const { error } = await supabaseAdmin().rpc("remove_source", { p_domain: d.data, p_reason: r.data, p_actor: user.id });
  if (error) return { status: "error", message: error.message };
  revalidatePath("/admin");
  revalidatePath("/value");
  revalidatePath("/deals");
  return { status: "ok", message: `${d.data} removed. Its listings no longer appear anywhere.` };
}

export async function recordComplaintAction(domain: string): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const d = domainSchema.safeParse(domain);
  if (!d.success) return { status: "error", message: "Invalid domain." };
  const { error } = await supabaseAdmin().from("source_domains").update({ complaint_received_at: new Date().toISOString() }).eq("domain", d.data);
  if (error) return { status: "error", message: error.message };
  await audit(user.id, "source_domain.complaint", d.data, null);
  revalidatePath("/admin");
  return { status: "ok", message: `Complaint recorded for ${d.data}.` };
}

export async function restoreSourceAction(domain: string): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const d = domainSchema.safeParse(domain);
  if (!d.success) return { status: "error", message: "Invalid domain." };
  const { error } = await supabaseAdmin().from("source_domains").update({ removed_at: null, removal_reason: null }).eq("domain", d.data);
  if (error) return { status: "error", message: error.message };
  await audit(user.id, "source_domain.restore", d.data, null);
  revalidatePath("/admin");
  revalidatePath("/value");
  return { status: "ok", message: `${d.data} restored.` };
}

/* ---------------------------------------------------------------- Review queue */

export async function reviewSnapshotAction(snapshotId: string, decision: "approve" | "withdraw"): Promise<AdminResult> {
  const { user } = await requireAdmin();
  if (!z.string().uuid().safeParse(snapshotId).success) return { status: "error", message: "Invalid snapshot." };
  const admin = supabaseAdmin();
  const { data: snap } = await admin.from("listing_snapshots").select("id,status,source_domain,business_id").eq("id", snapshotId).maybeSingle();
  if (!snap) return { status: "error", message: "Snapshot not found." };
  if (decision === "approve") {
    const { data: live } = await admin.rpc("source_is_live", { p_domain: snap.source_domain });
    if (live === false) return { status: "error", message: `Cannot approve: ${snap.source_domain} is excluded or was removed on complaint.` };
    const { error } = await admin.from("listing_snapshots").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", snapshotId);
    if (error) return { status: "error", message: error.message };
    await admin.from("source_submissions").update({ status: "approved" }).eq("snapshot_id", snapshotId);
    try {
      await refreshAggregate(snapshotId);
    } catch (err) {
      console.error("refreshAggregate failed", err);
    }
    // Valuation requests that were waiting for this listing go out now.
    try {
      const sent = await sendHeldInvites(snapshotId);
      if (sent) await audit(user.id, "invites.released", snapshotId, { count: sent });
    } catch (err) {
      console.error("sendHeldInvites failed", err);
    }
  } else {
    const { error } = await admin.from("listing_snapshots").update({ status: "withdrawn" }).eq("id", snapshotId);
    if (error) return { status: "error", message: error.message };
    await admin.from("source_submissions").update({ status: "rejected", reason: "withdrawn by admin" }).eq("snapshot_id", snapshotId);
  }
  await audit(user.id, `snapshot.${decision}`, snapshotId, { business_id: snap.business_id, previous: snap.status });
  revalidatePath("/admin");
  revalidatePath("/value");
  return { status: "ok", message: decision === "approve" ? "Listing approved and published to the Value queue." : "Listing withdrawn." };
}

/* ---------------------------------------------------------------- Invites */

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export async function addInviteAction(formData: FormData): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const emails = str(formData, "emails")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const valid = emails.filter((e) => emailSchema.safeParse(e).success);
  if (!valid.length) return { status: "error", message: "Enter one or more valid email addresses." };
  const note = str(formData, "note") || null;
  const admin = supabaseAdmin();
  const { error } = await admin.from("invites").upsert(
    valid.map((email) => ({ email, invited_by: user.id, note })),
    { onConflict: "email" },
  );
  if (error) return { status: "error", message: error.message };
  await admin.from("profiles").update({ invited: true }).in("email", valid);
  await audit(user.id, "invite.add", null, { emails: valid, note });
  revalidatePath("/admin");
  return { status: "ok", message: `${valid.length} ${valid.length === 1 ? "invite" : "invites"} added.` };
}

export async function removeInviteAction(email: string): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const e = emailSchema.safeParse(email);
  if (!e.success) return { status: "error", message: "Invalid email." };
  const admin = supabaseAdmin();
  const { error } = await admin.from("invites").delete().eq("email", e.data);
  if (error) return { status: "error", message: error.message };
  await admin.from("profiles").update({ invited: false }).eq("email", e.data);
  await audit(user.id, "invite.remove", e.data, null);
  revalidatePath("/admin");
  return { status: "ok", message: `${e.data} removed from invites.` };
}

/* ---------------------------------------------------------------- Scoring */

export async function recomputeAllAction(): Promise<AdminResult> {
  const { user } = await requireAdmin();
  try {
    const counts = await recomputeEverything();
    await audit(user.id, "scoring.recompute_all", null, counts);
    revalidatePath("/admin");
    revalidatePath("/points");
    return { status: "ok", message: `Recomputed ${counts.snapshots} snapshots and ${counts.skillRows} skill rows in ${counts.mode} mode.` };
  } catch (err) {
    console.error("recompute failed", err);
    return { status: "error", message: "Recompute failed. Check the server logs." };
  }
}

/** Void a forecast (fraud, duplicate account, NDA breach). The RPC writes its own audit row. */
export async function voidForecastAction(forecastId: string, reason: string): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const id = z.string().uuid().safeParse(forecastId);
  const r = z.string().trim().min(3).max(500).safeParse(reason ?? "");
  if (!id.success) return { status: "error", message: "Invalid forecast." };
  if (!r.success) return { status: "error", message: "Give a short reason." };
  const admin = supabaseAdmin();
  const { data: f } = await admin.from("forecast_submissions").select("snapshot_id,voided_at").eq("id", id.data).maybeSingle();
  if (!f) return { status: "error", message: "Forecast not found." };
  if (f.voided_at) return { status: "error", message: "Already voided." };
  const { error } = await admin.rpc("void_forecast", { p_forecast: id.data, p_reason: r.data, p_actor: user.id });
  if (error) return { status: "error", message: error.message };
  try {
    await recomputeSnapshot(f.snapshot_id, null);
  } catch (err) {
    console.error("recompute after void failed", err);
  }
  revalidatePath("/admin");
  revalidatePath("/value");
  revalidatePath("/points");
  return { status: "ok", message: "Forecast voided and the listing re-scored." };
}


/* ---------------------------------------------------------------- Listing facts (review) */

const factsSchema = z.object({
  headline: z.string().trim().min(2).max(120),
  industry: z.string().trim().min(2).max(80),
  industry_tags: z.string().max(300),
  state: z.string().trim().max(2),
  metro: z.string().trim().max(80),
  asking_price: z.number().positive().nullable(),
  revenue: z.number().positive().nullable(),
  earnings: z.number().positive().nullable(),
  earnings_type: z.enum(["sde", "ebitda", "seller_cash_flow", "unknown"]),
});

function moneyOrNull(v: string): number | null {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Correct a pending listing's neutral facts before approval (only pending_review snapshots are editable). */
export async function updateSnapshotFactsAction(snapshotId: string, formData: FormData): Promise<AdminResult> {
  const { user } = await requireAdmin();
  if (!z.string().uuid().safeParse(snapshotId).success) return { status: "error", message: "Invalid snapshot." };
  const parsed = factsSchema.safeParse({
    headline: str(formData, "headline"),
    industry: str(formData, "industry"),
    industry_tags: str(formData, "industry_tags"),
    state: str(formData, "state").toUpperCase(),
    metro: str(formData, "metro"),
    asking_price: moneyOrNull(str(formData, "asking_price")),
    revenue: moneyOrNull(str(formData, "revenue")),
    earnings: moneyOrNull(str(formData, "earnings")),
    earnings_type: str(formData, "earnings_type") || "unknown",
  });
  if (!parsed.success) return { status: "error", message: "Check the fields: headline and industry are required; money fields are whole dollars." };
  const f = parsed.data;
  const admin = supabaseAdmin();
  const { data: snap } = await admin.from("listing_snapshots").select("status").eq("id", snapshotId).maybeSingle();
  if (!snap) return { status: "error", message: "Snapshot not found." };
  if (snap.status !== "pending_review") return { status: "error", message: "Only listings awaiting review can be edited. Approved snapshots are frozen; create a new version instead." };
  const { regionForState } = await import("@/lib/sources/usStates");
  const { error } = await admin
    .from("listing_snapshots")
    .update({
      headline: f.headline,
      industry: f.industry,
      industry_tags: f.industry_tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      state: f.state || null,
      region: f.state ? regionForState(f.state) : null,
      metro: f.metro || null,
      asking_price: f.asking_price,
      revenue: f.revenue,
      earnings: f.earnings,
      earnings_type: f.earnings == null ? "unknown" : f.earnings_type,
    })
    .eq("id", snapshotId);
  if (error) return { status: "error", message: error.message };
  await audit(user.id, "snapshot.edit_facts", snapshotId, f);
  revalidatePath("/admin");
  return { status: "ok", message: "Facts saved. Approve to publish and send any held valuation requests." };
}

/* ---------------------------------------------------------------- Valuation requests (invites) */

export async function issueInviteAction(formData: FormData): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const parsed = inviteRequestSchema.safeParse({
    buyer_name: str(formData, "buyer_name"),
    buyer_email: str(formData, "buyer_email"),
    listing_url: str(formData, "listing_url"),
    information_level: str(formData, "information_level") || "cim",
    resend: str(formData, "resend") === "on",
  });
  if (!parsed.success) return { status: "error", message: "Enter the buyer's name, a valid email and the listing URL." };
  const r = parsed.data;
  try {
    const res = await issueInvite({ buyerName: r.buyer_name, buyerEmail: r.buyer_email, listingUrl: r.listing_url, informationLevel: r.information_level, resend: r.resend, createdBy: user.id });
    await audit(user.id, "invite.issue", r.buyer_email, { listing_url: r.listing_url, result: res.status });
    revalidatePath("/admin");
    const ok = res.status === "sent" || res.status === "captured" || res.status === "held" || res.status === "already_invited";
    return { status: ok ? "ok" : "error", message: `${res.status}: ${res.message}` };
  } catch (e) {
    console.error("issueInviteAction failed", e);
    return { status: "error", message: "Could not issue the invite. Check the logs." };
  }
}

export async function resendInviteAction(inviteId: string): Promise<AdminResult> {
  const { user } = await requireAdmin();
  if (!z.string().uuid().safeParse(inviteId).success) return { status: "error", message: "Invalid invite." };
  try {
    const res = await sendInviteEmail(inviteId);
    await audit(user.id, "invite.resend", inviteId, { result: res.status });
    revalidatePath("/admin");
    return res.status === "failed" ? { status: "error", message: res.error ?? "Email failed." } : { status: "ok", message: res.status === "sent" ? "Sent with a fresh link." : "Captured in the outbox (sending not configured)." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not resend." };
  }
}

export async function revokeInviteAction(inviteId: string): Promise<AdminResult> {
  const { user } = await requireAdmin();
  if (!z.string().uuid().safeParse(inviteId).success) return { status: "error", message: "Invalid invite." };
  await supabaseAdmin().from("listing_invites").update({ revoked_at: new Date().toISOString() }).eq("id", inviteId);
  await audit(user.id, "invite.revoke", inviteId, null);
  revalidatePath("/admin");
  return { status: "ok", message: "Link revoked." };
}
