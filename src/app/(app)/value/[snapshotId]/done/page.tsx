import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadCrowdStats, loadSource } from "@/lib/discovery/listings";
import { fmtMoney, type ForecastRow, type ListingSnapshot } from "@/lib/domain/types";
import { CrowdStats } from "@/components/CrowdStats";
import { BALANCE_SENTENCE, ButtonLink, CONFIDENCE_LABEL, Card, EvidenceBadge, Money, Points, ScoreRange, fmtDate, locationText } from "@/components/ui";
import { RevealUrl } from "@/components/RevealUrl";
import { assumedRange } from "@/lib/quant/model";
import { impliedMultiple } from "@/components/ValuationForm";

export const metadata = { title: "Valuation sealed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DonePage({ params }: PageProps<"/value/[snapshotId]/done">) {
  const { snapshotId } = await params;
  if (!UUID.test(snapshotId)) notFound();
  const { user } = await requireMember();
  const admin = supabaseAdmin();

  const { data: snap } = await admin.from("listing_snapshots").select("*").eq("id", snapshotId).maybeSingle();
  const s = (snap as ListingSnapshot | null) ?? null;
  if (!s) notFound();

  const { data: fc } = await admin.from("forecast_submissions").select("*").eq("user_id", user.id).eq("business_id", s.business_id).maybeSingle();
  const f = (fc as (ForecastRow & { rationale: string | null }) | null) ?? null;
  if (!f) redirect(`/value/${snapshotId}`);

  const source = await loadSource(s.source_domain);
  const [stats, { data: unlock }, { data: self }, { data: bal }] = await Promise.all([
    loadCrowdStats(s),
    admin.from("url_unlocks").select("id").eq("user_id", user.id).eq("business_id", s.business_id).maybeSingle(),
    admin.from("source_submissions").select("id").eq("user_id", user.id).eq("business_id", s.business_id).in("status", ["approved", "pending_review", "duplicate"]).limit(1).maybeSingle(),
    admin.rpc("point_balance", { p_user: user.id }),
  ]);
  const score = Number(f.current_score);
  const cap = Number(f.cap);
  const range = assumedRange(Number(f.value), f.confidence);
  const multiple = impliedMultiple(Number(f.value), s.earnings, s.earnings_type);

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/value" className="hover:text-text">
          Value businesses
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{s.headline}</span>
      </nav>

      <header className="mb-6">
        <p className="text-sm text-pos">Valuation sealed</p>
        <h1 className="text-2xl sm:text-3xl">{s.headline}</h1>
        <p className="mt-1 text-muted">
          {s.industry} · {locationText(s)} · snapshot <span className="figures">{fmtDate(s.snapshot_date)}</span>
        </p>
      </header>

      <Card className="mb-6">
        <dl className="grid gap-5 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Your enterprise value</dt>
            <dd className="figures text-2xl font-semibold">
              <Money value={Number(f.value)} />
            </dd>
            <dd className="text-sm text-muted">
              {CONFIDENCE_LABEL[f.confidence]} confidence{multiple ? ` · ${multiple.replace("= ", "")}` : ""}
            </dd>
            <dd className="figures text-xs text-muted">
              Assumed range {fmtMoney(range.lo, { compact: true })} to {fmtMoney(range.hi, { compact: true })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Possible score</dt>
            <dd className="mt-1 text-lg">
              <ScoreRange cap={cap} />
            </dd>
            <dd className="text-xs text-muted">Frozen when you submitted</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Your score for this business</dt>
            <dd className="text-2xl font-semibold">
              <Points value={score} />
              <span className="ml-2 text-sm font-normal text-muted">(can change)</span>
            </dd>
            <dd className="text-xs text-muted">Submitted {fmtDate(f.created_at)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted">{BALANCE_SENTENCE}</p>
        {f.rationale ? (
          <div className="mt-4 border-t border-border pt-3 text-sm">
            <p className="text-xs text-muted">Your private note</p>
            <p className="mt-1 whitespace-pre-wrap">{f.rationale}</p>
          </div>
        ) : null}
      </Card>

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Where the crowd stands now</h2>
          <EvidenceBadge nCount={stats.nCount} evidence={stats.evidence} />
        </div>
        <p className="mt-1 text-sm text-muted">
          Now that your valuation is sealed, you can see the pooled view for this listing. Based on {stats.nCount} independent {stats.nCount === 1 ? "valuation" : "valuations"},
          including yours.
        </p>
        <div className="mt-4">
          <CrowdStats stats={stats} />
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Source listing</h3>
          <RevealUrl
            businessId={s.business_id}
            nInd={stats.nCount}
            alreadyUnlocked={Boolean(unlock)}
            selfSubmitted={Boolean(self)}
            balance={Number(bal ?? 0)}
            publisher={source?.publisher ?? null}
            attributionText={source?.attribution_text ?? null}
          />
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/value">Value another business</ButtonLink>
        <ButtonLink href="/points" variant="secondary">
          My points
        </ButtonLink>
      </div>
    </div>
  );
}
