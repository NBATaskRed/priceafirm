import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ForecastRow, LedgerRow, ListingSnapshot } from "@/lib/domain/types";
import { BALANCE_SENTENCE, CONFIDENCE_LABEL, Card, EmptyState, Money, PageHeader, Points, PointsRange, fmtDate, locationText } from "@/components/ui";

export const metadata = { title: "My Points" };

const KIND_LABEL: Record<LedgerRow["kind"], string> = {
  WELCOME_GRANT: "Welcome grant",
  URL_REVEAL: "URL reveal",
  SCORE_CHANGE: "Score change",
  REFUND: "Refund",
  ADMIN_ADJUSTMENT: "Adjustment",
};

export default async function PointsPage() {
  const { user, balance } = await requireMember();
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

  const snapIds = [...new Set(forecasts.map((f) => f.snapshot_id))];
  const { data: sn } = snapIds.length ? await admin.from("listing_snapshots").select("id,headline,industry,state,region,metro").in("id", snapIds) : { data: [] };
  const snaps = new Map<string, Pick<ListingSnapshot, "id" | "headline" | "industry" | "state" | "region" | "metro">>();
  for (const s of (sn ?? []) as Array<Pick<ListingSnapshot, "id" | "headline" | "industry" | "state" | "region" | "metro">>) snaps.set(s.id, s);

  const scoredCount = forecasts.filter((f) => Number(f.current_score) !== 0).length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My points" lede={BALANCE_SENTENCE} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <p className="text-xs text-muted">Balance</p>
          <p className="figures mt-1 text-4xl font-semibold">
            {balance.toFixed(1).replace("-", "−")} <span className="text-base font-medium text-muted">pts</span>
          </p>
          <p className="mt-2 text-xs text-muted">{balance < 1 ? "Below the 1 point needed for a new URL reveal. Already-unlocked URLs stay open." : "Enough for a URL reveal."}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Valuations</p>
          <p className="figures mt-1 text-4xl font-semibold">{forecasts.length}</p>
          <p className="mt-2 text-xs text-muted">{scoredCount} with a non-zero score so far</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">URLs unlocked</p>
          <p className="figures mt-1 text-4xl font-semibold">{unlockCount ?? 0}</p>
          <p className="mt-2 text-xs text-muted">
            <Link href="/unlocked" className="underline hover:text-text">
              My unlocked listings
            </Link>
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <p className="text-xs text-muted">Skill percentile</p>
        {skill?.sufficient && skill.percentile != null ? (
          <p className="mt-1">
            <span className="figures text-2xl font-semibold">{ordinal(Math.round(skill.percentile))} percentile</span>
            <span className="ml-2 text-sm text-muted">· provisional · peer-predictive, not verified accuracy</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">Not enough evidence for a meaningful skill percentile yet (needs 5 scored forecasts). You have {skill?.scored_count ?? 0}.</p>
        )}
      </Card>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Your valuations</h2>
        {forecasts.length === 0 ? (
          <EmptyState
            title="No valuations yet"
            action={
              <Link href="/value" className="btn btn-primary btn-sm">
                Value a business
              </Link>
            }
          >
            Your first valuation on a listing carries the widest possible point range.
          </EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Your value</th>
                  <th>Confidence</th>
                  <th>Possible</th>
                  <th>Score</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f) => {
                  const s = snaps.get(f.snapshot_id);
                  return (
                    <tr key={f.id}>
                      <td>
                        <Link href={`/value/${f.snapshot_id}/done`} className="font-medium hover:underline">
                          {s?.headline ?? "Listing"}
                        </Link>
                        <span className="block text-xs text-muted">{s ? `${s.industry} · ${locationText(s)}` : ""}</span>
                      </td>
                      <td>
                        <Money value={Number(f.value)} />
                      </td>
                      <td>{CONFIDENCE_LABEL[f.confidence]}</td>
                      <td>
                        <PointsRange maxLoss={Number(f.max_loss)} maxGain={Number(f.max_gain)} showBar={false} />
                      </td>
                      <td>
                        <Points value={Number(f.current_score)} words />
                        <span className="block text-xs text-muted">can change</span>
                      </td>
                      <td className="figures whitespace-nowrap text-muted">{fmtDate(f.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Ledger</h2>
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Kind</th>
                <th>Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id}>
                  <td className="figures whitespace-nowrap text-muted">{fmtDate(row.created_at)}</td>
                  <td>{KIND_LABEL[row.kind]}</td>
                  <td>
                    <Points value={Number(row.amount)} />
                  </td>
                  <td className="text-muted">{row.note}</td>
                </tr>
              ))}
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted">
                    No ledger entries yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Amounts are shown to one decimal; the ledger stores four.</p>
      </section>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
