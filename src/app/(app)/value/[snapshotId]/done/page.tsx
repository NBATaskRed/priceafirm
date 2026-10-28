import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadCrowdStats, loadSource } from "@/lib/discovery/listings";
import type { ForecastRow, ListingSnapshot } from "@/lib/domain/types";
import { CrowdStats } from "@/components/CrowdStats";
import { ButtonLink, CONFIDENCE_LABEL, fmtShort, placeText } from "@/components/ui";
import { RevealUrl } from "@/components/RevealUrl";
import { impliedMultiple } from "@/components/ValuationForm";

export const metadata = { title: "Locked in" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signed(n: number): string {
  const s = Math.abs(n).toFixed(1);
  return n > 0.04 ? `+${s}` : n < -0.04 ? `−${s}` : "0.0";
}

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
  const value = Number(f.value);
  const multiple = impliedMultiple(value, s.earnings, s.earnings_type);
  const scoreTone = score > 0.04 ? "text-pos" : score < -0.04 ? "text-neg" : "text-text";

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-[18px]">
      <section className="flex items-center gap-3.5">
        <div className="seal flex h-14 w-14 flex-none items-center justify-center rounded-full bg-accent" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold tracking-[-0.015em]">Locked in</h1>
          <p className="mt-0.5 text-sm text-muted">
            You said <span className="figures font-bold text-text">{fmtShort(value)}</span>, {CONFIDENCE_LABEL[f.confidence].toLowerCase()} confidence
            {multiple ? <span className="figures"> ({multiple.replace("= ", "")})</span> : null}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {s.headline} · {placeText(s)}
          </p>
        </div>
      </section>

      <section className="card flex flex-col gap-1.5 p-4">
        <h2 className="text-sm font-normal text-muted">Your score for this business</h2>
        <p className={`figures text-[34px] font-bold leading-tight ${scoreTone}`}>{signed(score)}</p>
        <p className="text-sm leading-[1.45] text-text-soft">
          {f.voided_at
            ? "This valuation was voided, so it no longer moves your points."
            : `It moves up or down as other buyers value this business, anywhere between −${cap.toFixed(1)} and +${cap.toFixed(1)}.`}
        </p>
      </section>

      <CrowdStats stats={stats} you={value} yoursIncluded={Boolean(f.counts_toward_independent) && !f.voided_at} />

      {f.rationale ? (
        <details className="text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center text-muted hover:text-text">Your private note</summary>
          <p className="whitespace-pre-wrap text-text-soft">{f.rationale}</p>
        </details>
      ) : null}

      <div className="flex flex-col gap-2.5 pt-2">
        <RevealUrl
          businessId={s.business_id}
          nInd={stats.nCount}
          alreadyUnlocked={Boolean(unlock)}
          selfSubmitted={Boolean(self)}
          balance={Number(bal ?? 0)}
          publisher={source?.publisher ?? null}
          attributionText={source?.attribution_text ?? null}
        />
        <ButtonLink href="/value" variant="secondary" size="lg" className="w-full">
          Value another business
        </ButtonLink>
      </div>
    </div>
  );
}
