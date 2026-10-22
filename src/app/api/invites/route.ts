import { NextResponse, type NextRequest } from "next/server";
import { bearerMatches, inviteRequestSchema } from "@/lib/invites/token";
import { issueInvite } from "@/lib/invites/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/invites  (Authorization: Bearer INVITE_API_SECRET)
 * Body: { buyer_name, buyer_email, listing_url, information_level?, request_id?, resend? }
 * Creates the buyer account if needed, onboards the listing URL if new, and emails the valuation request.
 * See docs/INVITE_API.md.
 */
export async function POST(request: NextRequest) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.INVITE_API_SECRET)) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = inviteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "invalid", message: "Check the fields.", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const r = parsed.data;
  try {
    const result = await issueInvite({
      buyerName: r.buyer_name,
      buyerEmail: r.buyer_email,
      listingUrl: r.listing_url,
      informationLevel: r.information_level,
      requestId: r.request_id ?? null,
      resend: r.resend,
    });
    const code = result.status === "invalid" ? 400 : result.status === "listing_rejected" ? 422 : result.status === "email_failed" ? 502 : 200;
    return NextResponse.json(result, { status: code });
  } catch (e) {
    console.error("issueInvite failed", e);
    return NextResponse.json({ status: "error", message: "Internal error. Safe to retry with the same request_id." }, { status: 500 });
  }
}
