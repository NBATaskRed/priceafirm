import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { recomputeEverything } from "@/lib/actions/recompute-core";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const counts = await recomputeEverything();
    return NextResponse.json({ ok: true, ...counts, at: new Date().toISOString() });
  } catch (err) {
    console.error("cron recompute failed", err);
    return NextResponse.json({ ok: false, error: "recompute_failed" }, { status: 500 });
  }
}
