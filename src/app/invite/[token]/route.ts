import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashInviteToken, looksLikeInviteToken } from "@/lib/invites/token";

export const dynamic = "force-dynamic";

/**
 * Auto-login link from the valuation request email. Valid until expires_at and reusable until then (email
 * link scanners may open it first). Signs the buyer in as their own account and lands on the valuation form.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = (process.env.APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
  const fail = (code: string, next = "/value") => NextResponse.redirect(`${base}/login?error=${code}&next=${encodeURIComponent(next)}`);
  if (!looksLikeInviteToken(token)) return fail("invite_invalid");

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("listing_invites")
    .select("id,user_id,buyer_email,snapshot_id,expires_at,revoked_at,open_count,first_opened_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  const inv = data as { id: string; user_id: string; buyer_email: string; snapshot_id: string; expires_at: string; revoked_at: string | null; open_count: number; first_opened_at: string | null } | null;
  if (!inv || inv.revoked_at) return fail("invite_invalid");
  const dest = `/value/${inv.snapshot_id}?welcome=1`;
  if (new Date(inv.expires_at).getTime() < Date.now()) return fail("invite_expired", `/value/${inv.snapshot_id}`);

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase.auth.getUser();
  if (current.user?.id !== inv.user_id) {
    if (current.user) await supabase.auth.signOut();
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: inv.buyer_email });
    const hashed = link?.properties?.hashed_token;
    if (error || !hashed) {
      console.error("invite generateLink failed", error);
      return fail("invite_failed", `/value/${inv.snapshot_id}`);
    }
    const { error: vErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: hashed });
    if (vErr) {
      console.error("invite verifyOtp failed", vErr);
      return fail("invite_failed", `/value/${inv.snapshot_id}`);
    }
  }

  const now = new Date().toISOString();
  await admin
    .from("listing_invites")
    .update({ open_count: (inv.open_count ?? 0) + 1, last_opened_at: now, first_opened_at: inv.first_opened_at ?? now })
    .eq("id", inv.id);
  return NextResponse.redirect(`${base}${dest}`);
}
