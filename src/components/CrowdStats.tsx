import type { CrowdStatsView } from "@/lib/discovery/listings";
import { basedOnText, fmtShort } from "./ui";
import { BuyersBand } from "./ValueBand";

/** "1.23x": two decimals; amber text at or above 1.00x (spec 2, accent-text). */
export function RatioFigure({ ratio, className = "" }: { ratio: number; className?: string }) {
  return <span className={`figures ${ratio >= 1 ? "text-accent-text" : "text-text"} ${className}`}>{ratio.toFixed(2)}x</span>;
}

/**
 * "What buyers think so far" (spec 4.3): median value, a P10 to P90 band with the ask tick and your
 * dot, two tiles (x of ask, chance it's worth more than ask) and the count line. Only rendered after
 * exposure (locked-in page, opened listings).
 */
export function CrowdStats({
  stats,
  you = null,
  yoursIncluded = false,
  heading = "What buyers think so far",
  headingLevel = 2,
}: {
  stats: CrowdStatsView;
  you?: number | null;
  yoursIncluded?: boolean;
  heading?: string;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  if (stats.nCount <= 0 || stats.medianEv == null) {
    return (
      <section className="flex flex-col gap-2.5">
        <H className="text-[17px] font-semibold">{heading}</H>
        <p className="text-[15px] text-muted">No independent valuations yet. The buyers&apos; view appears here as valuations arrive.</p>
        {stats.askingPrice != null ? (
          <p className="text-sm text-muted">
            Asking price <span className="figures font-semibold text-text">{fmtShort(stats.askingPrice)}</span>
          </p>
        ) : null}
      </section>
    );
  }

  const count = basedOnText(stats.nCount);
  return (
    <section className="flex flex-col gap-2.5">
      <H className="text-[17px] font-semibold">{heading}</H>
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <span className="figures text-[40px] font-bold leading-[1.1] tracking-[-0.01em]">{fmtShort(stats.medianEv)}</span>
        <span className="text-[15px] text-muted">median value</span>
      </div>
      <BuyersBand ask={stats.askingPrice} p10={stats.p10} p90={stats.p90} median={stats.medianEv} you={you} />
      {stats.medianToAsk != null || stats.prAboveAsk != null ? (
        <dl className="grid grid-cols-2 gap-2">
          {stats.medianToAsk != null ? (
            <div className="tile-2 flex flex-col-reverse">
              <dt className="tile-label mt-0.5">of the asking price</dt>
              <dd className="text-[18px] font-bold">
                <RatioFigure ratio={stats.medianToAsk} />
              </dd>
            </div>
          ) : null}
          {stats.prAboveAsk != null ? (
            <div className="tile-2 flex flex-col-reverse">
              <dt className="tile-label mt-0.5">chance it&apos;s worth more than ask</dt>
              <dd className="figures text-[18px] font-bold">{Math.round(stats.prAboveAsk * 100)}%</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <p className="text-[13px] text-muted">
        {count}
        {yoursIncluded ? ", yours included" : ""}. Model estimates, not offers.
      </p>
    </section>
  );
}
