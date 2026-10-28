import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ForecastRow, LedgerRow, ListingSnapshot } from "@/lib/domain/types";
import { CONFIDENCE_LABEL, EmptyState, fmtPoints, fmtShort } from "@/components/ui";

export const metadata = { title: "My points" };

type SnapLite = Pick<ListingSnapshot, "id" | "business_id" | "headline" | "state">;

interface Move {
  key: string;
  at: string;
  title: string;
  reason: string;
  amount: number;
  tone: "pos" | "neg" | "plain" | "muted";
}

function signed(n: number): string {
  const s = Math.abs(n).toFixed(1);
  if (Math.abs(n) < 0.05) return "0.0";
  return n > 0 ? `+${s}` : `−${s}`;
}

function reasonFor(row: LedgerRow): { reason: string; tone: Move["tone"] } | null {
  const a = Number(row.amount);
  switch (row.kind) {
    case "SCORE_CHANGE":
      if (Math.abs(a) < 0.05) return null;
      return a > 0 ? { reason: "A new buyer landed close to you", tone: "pos" } : { reason: "A new buyer landed far from you", tone: "neg" };
    case "URL_REVEAL":
      return { reason: "Opened the broker listing", tone: "plain" };
    case "URL_REVEAL_FREE":
      return { reason: "Opened the broker listing, free", tone: "muted" };
    case "WELCOME_GRANT":
      return { reason: "Welcome points", tone: "pos" };
    case "REFUND":
      return { reason: "Refund", tone: a >= 0 ? "pos" : "neg" };
    case "ADMIN_ADJUSTMENT":
      return { reason: "Adjusted by PriceAFirm", tone: a >= 0 ? "pos" : "neg" };
  }
}

const TONE: Record<Move["tone"], string> = { pos: "text-pos", neg: "text-neg", plain: "text-text", muted: "text-muted" };

export default async function PointsPage() {
  const { user, profile, balance } = await requireMember();
  const admin = supabaseAdmin();

  const [{ data: fc }, { data: lg }, { count: unlockCount }, { data: sk }] = await Promise.all([
    admin.from("forecast_submissions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("point_ledger").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
    admin.from("url_unlocks").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("skill_statistics").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  const forecasts = (fc ?? []) as ForecastRow[];
  const ledger = (lg ?? []) as LedgerRow[];
  const skill = sk as { scored_count: number; percentile: number | null; sufficient: boolean } | null;

  const businessIds = [...new Set([...forecasts.map((f) => f.business_id), ...ledger.map((l) => l.business_id).filter((b): b is string => Boolean(b))])];
  const { data: sn } = businessIds.length
    ? await admin.from("listing_snapshots").select("id,business_id,headline,state").in("business_id", businessIds)
    : { data: [] as SnapLite[] };
  const byBusiness = new Map<string, SnapLite>();
  for (const s of (sn ?? []) as SnapLite[]) if (!byBusiness.has(s.business_id)) byBusiness.set(s.business_id, s);
  const titleFor = (businessId: string | null) => {
    const s = businessId ? byBusiness.get(businessId) : null;
    return s ? [s.headline, s.state].filter(Boolean).join(", ") : "PriceAFirm";
  };

  // Recent moves: ledger rows in plain words, plus valuations still waiting for other buyers.
  const moved = new Set(ledger.filter((l) => l.kind === "SCORE_CHANGE" && l.forecast_id).map((l) => l.forecast_id as string));
  const moves: Move[] = [];
  for (const row of ledger) {
    const r = reasonFor(row);
    if (!r) continue;
    moves.push({ key: `l${row.id}`, at: row.created_at, title: titleFor(row.business_id), reason: r.reason, amount: Number(row.amount), tone: r.tone });
  }
  for (const f of forecasts) {
    if (f.voided_at || moved.has(f.id) || Math.abs(Number(f.current_score)) >= 0.05) continue;
    moves.push({ key: `f${f.id}`, at: f.created_at, title: titleFor(f.business_id), reason: "Locked in, waiting for other buyers", amount: 0, tone: "muted" });
  }
  moves.sort((a, b) => b.at.localeCompare(a.at));
  const recent = moves.slice(0, 12);

  const live = forecasts.filter((f) => !f.voided_at);
  const earned = live.reduce((s, f) => s + Number(f.current_score), 0);
  const used = Math.min(5, live.length);
  const floorClipped = Number(profile.first5_floor_clipped ?? 0);
  const opens = Math.max(0, Math.floor(balance));

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-[18px]">
      <h1 className="sr-only">My points</h1>
      <section className="flex flex-col gap-1">
        <span className="text-[15px] text-muted">Your balance</span>
        <span className="figures text-[64px] font-extrabold leading-none tracking-[-0.02em] text-accent-text">{fmtPoints(balance)}</span>
        <span className="text-[15px] text-text-soft">
          {opens > 0 ? `points, enough to open ${opens} well-valued ${opens === 1 ? "listing" : "listings"}` : "points. Value a business to earn more."}
        </span>
      </section>

      <dl className="grid grid-cols-3 gap-2">
        <div className="tile flex flex-col-reverse p-3">
          <dt className="tile-label mt-0.5">valued</dt>
          <dd className="figures text-[22px] font-bold">{forecasts.length}</dd>
        </div>
        <div className="tile flex flex-col-reverse p-3">
          <dt className="tile-label mt-0.5">listings opened</dt>
          <dd className="figures text-[22px] font-bold">{unlockCount ?? 0}</dd>
        </div>
        <div className="tile flex flex-col-reverse p-3">
          <dt className="tile-label mt-0.5">earned so far</dt>
          <dd className="figures text-[22px] font-bold">{signed(earned)}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-1">
        <h2 className="mb-1.5 text-[17px] font-semibold">Recent moves</h2>
        {recent.length === 0 ? (
          <EmptyState
            title="No moves yet"
            action={
              <Link href="/value" className="btn btn-primary btn-sm">
                Value a business
              </Link>
            }
          >
            The fewer valuations a listing has, the more points are at stake.
          </EmptyState>
        ) : (
          <ul>
            {recent.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{m.title}</span>
                  <span className="text-[13px] text-muted">{m.reason}</span>
                </div>
                <span className={`figures text-[18px] font-bold ${TONE[m.tone]}`}>{signed(m.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tile flex flex-col gap-2.5 rounded-[14px] px-4 py-3.5">
        <h2 className="text-[15px] font-semibold">Beginner&apos;s protection</h2>
        <div className="grid grid-cols-5 gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-1.5 rounded-[3px] ${i < used ? "bg-accent" : "bg-border-strong"}`} />
          ))}
        </div>
        <p className="text-sm leading-[1.45] text-text-soft">
          {used < 5
            ? `${used} of your first 5 valuations used. Until then, you can't lose more than 3 points in total on them.`
            : "All of your first 5 valuations used. You can't lose more than 3 points in total on them; later valuations count in full."}
          {floorClipped > 0 ? <> It has saved you <span className="figures">{floorClipped.toFixed(1)}</span> points so far.</> : null}
        </p>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1">
        <h2 className="text-[15px] font-normal text-muted">Your skill rank</h2>
        <span className="text-[15px] text-text-soft">
          {skill?.sufficient && skill.percentile != null
            ? `${ordinal(Math.round(skill.percentile))} percentile, provisional`
            : `Ready after 5 scored valuations (${skill?.scored_count ?? 0} so far)`}
        </span>
      </section>

      {forecasts.length > 0 ? (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted hover:text-text">Your valuations ({forecasts.length})</summary>
          <ul>
            {forecasts.map((f) => (
              <li key={f.id} className="border-b border-border last:border-b-0">
                <Link href={`/value/${f.snapshot_id}/done`} className="flex items-center justify-between gap-3 py-3 no-underline hover:bg-surface-2">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{titleFor(f.business_id)}</span>
                    <span className="text-[13px] text-muted">
                      You said <span className="figures">{fmtShort(Number(f.value))}</span>, {CONFIDENCE_LABEL[f.confidence].toLowerCase()} confidence
                      {f.voided_at ? ", voided" : ""}
                    </span>
                  </span>
                  <span className={`figures text-[18px] font-bold ${Number(f.current_score) > 0.04 ? "text-pos" : Number(f.current_score) < -0.04 ? "text-neg" : "text-muted"}`}>
                    {signed(Number(f.current_score))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-xs text-muted">Points aren&apos;t cash. Your score is peer-predictive: it shows how close your valuations land to later buyers&apos; valuations.</p>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
