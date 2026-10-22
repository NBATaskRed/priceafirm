import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { onboardListingUrl } from "@/lib/sources";
import { sendEmail } from "@/lib/mail/send";
import { valuationRequestEmail } from "@/lib/mail/templates";
import type { ListingSnapshot } from "@/lib/domain/types";
import { firstName, hashInviteToken, inviteTtlDays, newInviteToken } from "./token";

export interface IssueInviteInput {
  buyerName: string;
  buyerEmail: string;
  listingUrl: string;
  informationLevel: "cim" | "listing";
  requestId?: string | null;
  resend?: boolean;
  createdBy?: string | null;
}

export type IssueInviteResult =
  | { status: "sent" | "captured"; inviteId: string; userId: string; snapshotId: string; listingStatus: "existing" | "created"; inviteUrl: string; message: string }
  | { status: "held"; inviteId: string; userId: string; snapshotId: string; listingStatus: "existing" | "created"; message: string }
  | { status: "already_invited" | "already_valued" | "exposed"; inviteId?: string; userId: string; snapshotId: string; message: string }
  | { status: "email_failed"; inviteId: string; userId: string; snapshotId: string; message: string }
  | { status: "listing_rejected" | "invalid"; message: string };

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function locationOf(s: Pick<ListingSnapshot, "metro" | "state" | "region">): string | null {
  const parts = [s.metro, s.state].filter(Boolean);
  return parts.length ? parts.join(", ") : s.region;
}

/** Find or create the buyer's account (email verified, invited). One account per email across all listings. */
export async function ensureBuyerAccount(email: string, name: string): Promise<string> {
  const db = supabaseAdmin();
  const find = async () => (await db.from("profiles").select("id,display_name,invited").eq("email", email).maybeSingle()).data as { id: string; display_name: string | null; invited: boolean } | null;
  let profile = await find();
  if (!profile) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
    if (error && !/already|registered|exists/i.test(error.message)) throw error;
    profile = await find();
    if (!profile && data?.user) {
      await db.from("profiles").upsert({ id: data.user.id, email }, { onConflict: "id", ignoreDuplicates: true });
      profile = await find();
    }
    if (!profile) throw new Error(`Could not create account for ${email}`);
  }
  const patch: Record<string, unknown> = {};
  if (!profile.invited) patch.invited = true;
  if (!profile.display_name) patch.display_name = name;
  if (Object.keys(patch).length) await db.from("profiles").update(patch).eq("id", profile.id);
  await db.from("invites").upsert({ email, note: "Valuation request (auto)" }, { onConflict: "email", ignoreDuplicates: true });
  return profile.id;
}

/**
 * Mint a fresh token for an invite (the old one stops working), reset its expiry, and email the buyer.
 * Only called once the listing is approved.
 */
export async function sendInviteEmail(inviteId: string): Promise<{ status: "sent" | "captured" | "failed"; inviteUrl: string; error?: string }> {
  const db = supabaseAdmin();
  const { data: inv } = await db.from("listing_invites").select("id,buyer_email,buyer_name,snapshot_id").eq("id", inviteId).single();
  const invite = inv as { id: string; buyer_email: string; buyer_name: string | null; snapshot_id: string };
  const { data: snap } = await db.from("listing_snapshots").select("headline,metro,state,region,status").eq("id", invite.snapshot_id).single();
  const s = snap as Pick<ListingSnapshot, "headline" | "metro" | "state" | "region" | "status">;
  if (s.status !== "approved") throw new Error("Listing is not approved yet");

  const token = newInviteToken();
  const days = inviteTtlDays();
  await db
    .from("listing_invites")
    .update({ token_hash: hashInviteToken(token), expires_at: new Date(Date.now() + days * 86_400_000).toISOString() })
    .eq("id", inviteId);
  const inviteUrl = `${appUrl()}/invite/${token}`;
  const email = valuationRequestEmail({ firstName: firstName(invite.buyer_name), headline: s.headline, location: locationOf(s), url: inviteUrl, expiresDays: days });
  const res = await sendEmail({ to: invite.buyer_email, kind: "valuation_request", email, relatedInvite: inviteId, redact: [inviteUrl] });
  await db.from("listing_invites").update({ email_status: res.status, email_error: res.error ?? null }).eq("id", inviteId);
  return { status: res.status, inviteUrl, error: res.error };
}

/** Send every invite that was held because its listing was waiting for review. */
export async function sendHeldInvites(snapshotId: string): Promise<number> {
  const db = supabaseAdmin();
  const { data } = await db.from("listing_invites").select("id").eq("snapshot_id", snapshotId).eq("email_status", "pending").is("revoked_at", null).is("submitted_at", null);
  let n = 0;
  for (const row of (data ?? []) as Array<{ id: string }>) {
    await sendInviteEmail(row.id);
    n++;
  }
  return n;
}

export async function issueInvite(input: IssueInviteInput): Promise<IssueInviteResult> {
  const db = supabaseAdmin();

  if (input.requestId) {
    const { data: prior } = await db.from("listing_invites").select("id,user_id,snapshot_id,email_status").eq("request_id", input.requestId).maybeSingle();
    if (prior) {
      const p = prior as { id: string; user_id: string; snapshot_id: string; email_status: string };
      return { status: "already_invited", inviteId: p.id, userId: p.user_id, snapshotId: p.snapshot_id, message: `Request ${input.requestId} was already processed (email ${p.email_status}).` };
    }
  }

  // 1. Listing: resolve the URL, onboarding it first if it is new.
  const listing = await onboardListingUrl(input.listingUrl);
  if (listing.status === "invalid" || listing.status === "blocked") {
    return listing.status === "invalid" ? { status: "invalid", message: listing.message } : { status: "listing_rejected", message: listing.message };
  }
  const { businessId, snapshotId } = listing;

  // 2. Buyer account (one per email, reused across listings).
  const userId = await ensureBuyerAccount(input.buyerEmail, input.buyerName);

  // 3. Eligibility: one scored valuation per buyer per business, and never after crowd exposure.
  const [{ data: valued }, { data: exposed }] = await Promise.all([
    db.from("forecast_submissions").select("id").eq("user_id", userId).eq("business_id", businessId).limit(1).maybeSingle(),
    db.rpc("is_exposed", { p_user: userId, p_business: businessId }),
  ]);
  if (valued) return { status: "already_valued", userId, snapshotId, message: "This buyer already valued this business. No email sent." };
  if (exposed) return { status: "exposed", userId, snapshotId, message: "This buyer has seen PriceAFirm crowd figures for this business, so a scored valuation is not available. No email sent." };

  // 4. Reuse an open invite for the same buyer and listing unless a resend was requested.
  const { data: open } = await db
    .from("listing_invites")
    .select("id,email_status,expires_at")
    .eq("user_id", userId)
    .eq("snapshot_id", snapshotId)
    .is("revoked_at", null)
    .is("submitted_at", null)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let inviteId: string;
  if (open) {
    const o = open as { id: string; email_status: string; expires_at: string };
    const live = new Date(o.expires_at).getTime() > Date.now() && (o.email_status === "sent" || o.email_status === "captured");
    if (live && !input.resend) return { status: "already_invited", inviteId: o.id, userId, snapshotId, message: "An open invite already exists for this buyer and listing. Pass resend: true to send it again." };
    inviteId = o.id;
    if (input.requestId) await db.from("listing_invites").update({ request_id: input.requestId }).eq("id", inviteId);
  } else {
    const { data: created, error } = await db
      .from("listing_invites")
      .insert({
        token_hash: hashInviteToken(newInviteToken()), // placeholder; a fresh token is minted when the email goes out
        snapshot_id: snapshotId,
        business_id: businessId,
        user_id: userId,
        buyer_email: input.buyerEmail,
        buyer_name: input.buyerName,
        information_level: input.informationLevel,
        request_id: input.requestId ?? null,
        expires_at: new Date(Date.now() + inviteTtlDays() * 86_400_000).toISOString(),
        created_by: input.createdBy ?? null,
      })
      .select("id")
      .single();
    if (error || !created) throw error ?? new Error("Could not create invite");
    inviteId = (created as { id: string }).id;
  }

  // 5. Send now, or hold until an admin approves the listing's facts.
  const listingStatus = listing.status;
  if (!listing.approved) {
    return { status: "held", inviteId, userId, snapshotId, listingStatus, message: "Listing onboarded but its facts need admin review (Admin > Review). The email goes out automatically on approval." };
  }
  const sent = await sendInviteEmail(inviteId);
  if (sent.status === "failed") return { status: "email_failed", inviteId, userId, snapshotId, message: sent.error ?? "Email failed" };
  return {
    status: sent.status,
    inviteId,
    userId,
    snapshotId,
    listingStatus,
    inviteUrl: sent.inviteUrl,
    message: sent.status === "sent" ? "Email sent." : "Email captured in the outbox (sending is not configured).",
  };
}

/** Called after a buyer seals a valuation: mark their invite for that listing submitted. */
export async function inviteForSubmission(userId: string, snapshotId: string): Promise<{ id: string; information_level: "cim" | "listing" } | null> {
  const { data } = await supabaseAdmin()
    .from("listing_invites")
    .select("id,information_level")
    .eq("user_id", userId)
    .eq("snapshot_id", snapshotId)
    .is("revoked_at", null)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; information_level: "cim" | "listing" } | null) ?? null;
}

export async function markInviteSubmitted(inviteId: string) {
  await supabaseAdmin().from("listing_invites").update({ submitted_at: new Date().toISOString() }).eq("id", inviteId).is("submitted_at", null);
}
