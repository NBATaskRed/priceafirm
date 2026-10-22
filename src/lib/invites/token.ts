import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** 32 random bytes, URL-safe. Only its hash is stored. */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function looksLikeInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,60}$/.test(token);
}

/** Constant-time bearer check for the invite API. */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const INVITE_TTL_DAYS_DEFAULT = 30;

export function inviteTtlDays(): number {
  const n = Number(process.env.INVITE_TTL_DAYS);
  return Number.isFinite(n) && n >= 1 && n <= 90 ? Math.floor(n) : INVITE_TTL_DAYS_DEFAULT;
}

/** Body accepted by POST /api/invites (snake_case for the calling system). */
export const inviteRequestSchema = z.object({
  buyer_name: z.string().trim().min(1).max(120),
  buyer_email: z.string().trim().toLowerCase().email().max(254),
  /** Public listing page URL. Listings are identified by URL; unknown URLs are onboarded first. */
  listing_url: z.string().trim().min(8).max(2048),
  information_level: z.enum(["cim", "listing"]).default("cim"),
  request_id: z.string().trim().min(1).max(200).optional(),
  resend: z.boolean().default(false),
});
export type InviteRequest = z.infer<typeof inviteRequestSchema>;

export function firstName(fullName: string | null | undefined): string | null {
  const f = (fullName ?? "").trim().split(/\s+/)[0];
  return f ? f.charAt(0).toUpperCase() + f.slice(1) : null;
}
