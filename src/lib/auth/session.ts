import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/types";

export const TERMS_VERSION = "2026-10";

export interface SessionUser {
  id: string;
  email: string;
}

export interface Member {
  user: SessionUser;
  profile: Profile;
  balance: number;
  admin: boolean;
}

/** The signed-in user from the request cookies, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;
  return { id: user.id, email: user.email.toLowerCase() };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabaseAdmin().from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

export async function getBalance(userId: string): Promise<number> {
  const { data } = await supabaseAdmin().rpc("point_balance", { p_user: userId });
  return Number(data ?? 0);
}

export function inviteOnly(): boolean {
  return process.env.INVITE_ONLY !== "0";
}

/**
 * Every app screen and every server action starts here: signed in, profile present, and past the
 * invite gate (or an admin). Redirects otherwise.
 */
export async function requireMember(): Promise<Member> {
  const user = await requireUser();
  let profile = await getProfile(user.id);
  if (!profile) {
    // The signup trigger normally creates the profile; recover if it did not.
    const admin = supabaseAdmin();
    await admin.from("profiles").upsert({ id: user.id, email: user.email }, { onConflict: "id", ignoreDuplicates: true });
    profile = await getProfile(user.id);
    if (!profile) redirect("/login");
  }
  const admin = isAdmin(user.email) || profile.role === "admin";
  if (inviteOnly() && !profile.invited && !admin) redirect("/waitlist");
  const balance = await getBalance(user.id);
  return { user, profile, balance, admin };
}

export async function requireAdmin(): Promise<Member> {
  const member = await requireMember();
  if (!member.admin) redirect("/value");
  return member;
}

export function hasAcceptedTerms(profile: Pick<Profile, "accepted_terms_version">): boolean {
  return profile.accepted_terms_version === TERMS_VERSION;
}

/** Persist the acknowledgement once. Idempotent. */
export async function acceptTerms(userId: string): Promise<void> {
  await supabaseAdmin()
    .from("profiles")
    .update({ accepted_terms_version: TERMS_VERSION, accepted_terms_at: new Date().toISOString() })
    .eq("id", userId);
}
