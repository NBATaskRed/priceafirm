"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshAggregate } from "@/lib/quant/service";
import { recomputeEverything } from "./recompute-core";
import { isBlockedDomain, registrableDomain } from "@/lib/sources/normalize";
import { str } from "./guards";

export type AdminResult = { status: "ok"; message: string } | { status: "error"; message: string };

async function audit(actor: string, action: string, target: string | null, payload: Record<string, unknown> | null) {
  await supabaseAdmin().from("admin_audit").insert({ actor, action, target, payload });
}

const RIGHT_FLAGS = [
  "may_fetch",
  "may_store",
  "may_display_ask",
  "may_display_ev_to_ask",
  "may_show_anonymous_preview",
  "may_link_original_listing",
  "may_log_referral",
  "attribution_required",
] as const;
type RightFlag = (typeof RIGHT_FLAGS)[number];

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(/^[a-z0-9.-]+$/);

/* ---------------------------------------------------------------- Sources */

export async function addSourceDomainAction(formData: FormData): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const raw = domainSchema.safeParse(str(formData, "domain").replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  if (!raw.success) return { status: "error", message: "Enter a bare domain like example.com." };
  const domain = registrableDomain(raw.data.replace(/^www\./, ""));
  if (isBlockedDomain(domain)) return { status: "error", message: `${domain} is hard-blocked for the pilot and cannot be added.` };
  const status = str(formData, "status") === "allowed" ? "allowed" : "review";
  const publisher = str(formData, "publisher") || null;
  const { error } = await supabaseAdmin().from("source_domains").upsert({ domain, status, publisher, effective_date: new Date().toISOString().slice(0, 10) }, { onConflict: "domain" });
  if (error) return { status: "error", message: error.message };
  await audit(user.id, "source_domain.add", domain, { status, publisher });
  revalidatePath("/admin");
  return { status: "ok", message: `${domain} added as ${status}.` };
}

export async function setSourceStatusAction(domain: string, status: "allowed" | "blocked" | "review"): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const d = domainSchema.safeParse(domain);
  if (!d.success || !["allowed", "blocked", "review"].includes(status)) return { status: "error", message: "Invalid input." };
  if (isBlockedDomain(d.data) && status !== "blocked") return { status: "error", message: `${d.data} is hard-blocked in code; it stays blocked.` };
  const patch: Record<string, unknown> = { status };
  if (status === "blocked") patch.revoked_at = new Date().toISOString();
  if (status === "allowed") patch.revoked_at = null;
  const { error } = await supabaseAdmin().from("source_domains").update(patch).eq("domain", d.data);
  if (error) return { status: "error", message: error.message };
  await audit(user.id, "source_domain.status", d.data, { status });
  revalidatePath("/admin");
  return { status: "ok", message: `${d.data} is now ${status}.` };
}

export async function toggleSourceRightAction(domain: string, flag: string, value: boolean): Promise<AdminResult> {
  const { user } = await requireAdmin();
  const d = domainSchema.safeParse(domain);
  if (!d.success || !RIGHT_FLAGS.includes(flag as RightFlag)) return { status: "error", message: "Invalid input." };
  const { error } = await supabaseAdmin()
    .from("source_domains")
    .update({ [flag]: Boolean(value) })
    .eq("domain", d.data);
  if (error) return { status: "error", message: error.message };
  await audit(user.id, "source_domain.right", d.data, { flag, value: Boolean(value) });
  revalidatePath("/admin");
  return { status: "ok", message: `${flag} ${value ? "on" : "off"} for ${d.data}.` };
}

/* ---------------------------------------------------------------- Review queue */

export async function reviewSnapshotAction(snapshotId: string, decision: "approve" | "withdraw"): Promise<AdminResult> {
  const { user } = await requireAdmin();
  if (!z.string().uuid().safeParse(snapshotId).success) return { status: "error", message: "Invalid snapshot." };
  const admin = supabaseAdmin();
  const { data: snap } = await admin.from("listing_snapshots").select("id,status,source_domain,business_id").eq("id", snapshotId).maybeSingle();
  if (!snap) return { status: "error", message: "Snapshot not found." };
  if (decision === "approve") {
    const { data: rights } = await admin.from("source_domains").select("status,may_store,revoked_at").eq("domain", snap.source_domain).maybeSingle();
    if (!rights || rights.status !== "allowed" || !rights.may_store || rights.revoked_at) {
      return { status: "error", message: `Cannot approve: ${snap.source_domain} is not an allowed source with storage rights.` };
    }
    const { error } = await admin.from("listing_snapshots").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", snapshotId);
    if (error) return { status: "error", message: error.message };
    await admin.from("source_submissions").update({ status: "approved" }).eq("snapshot_id", snapshotId);
    try {
      await refreshAggregate(snapshotId);
    } catch (err) {
      console.error("refreshAggregate failed", err);
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
