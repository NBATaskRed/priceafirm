import type { CrowdStatsView } from "@/lib/discovery/listings";
import { MODEL_DERIVED, Money } from "./ui";

function pct(n: number | null): string {
  return n == null ? "n/a" : `${Math.round(n * 100)}%`;
}
function ratio(n: number | null): string {
  return n == null ? "n/a" : `${n.toFixed(2)}×`;
}

function disagreementWord(d: number | null): string {
  if (d == null) return "Needs 2+ opinions";
  if (d < 0.15) return `Low (${d.toFixed(2)})`;
  if (d < 0.35) return `Moderate (${d.toFixed(2)})`;
  return `High (${d.toFixed(2)})`;
}
function concentrationWord(c: number | null): string {
  if (c == null) return "n/a";
  if (c >= 0.6) return `One voice dominates (${Math.round(c * 100)}%)`;
  if (c >= 0.35) return `Somewhat concentrated (${Math.round(c * 100)}%)`;
  return `Spread out (${Math.round(c * 100)}%)`;
}

/**
 * Model-derived crowd statistics. Only ever rendered after exposure (Find deals rows, done page, unlocked).
 * Ask-relative figures appear only when the source permits them.
 */
export function CrowdStats({ stats }: { stats: CrowdStatsView }) {
  if (stats.nCount <= 0) {
    return (
      <div className="text-sm">
        <p className="font-medium">No independent valuations yet. Ask benchmark only.</p>
        {stats.askingPrice != null ? (
          <p className="mt-1 text-muted">
            Asking price <Money value={stats.askingPrice} className="text-text" />.
          </p>
        ) : (
          <p className="mt-1 text-muted">No asking price was listed.</p>
        )}
        <p className="mt-2 text-xs text-muted">Be the first to value it from the queue and the pooled view will appear here.</p>
      </div>
    );
  }

  const spreadLo = stats.p10;
  const spreadHi = stats.p90;
  const med = stats.medianEv;
  let medPct = 50;
  if (spreadLo != null && spreadHi != null && med != null && spreadHi > spreadLo) {
    medPct = Math.min(96, Math.max(4, ((Math.log(med) - Math.log(spreadLo)) / (Math.log(spreadHi) - Math.log(spreadLo))) * 100));
  }

  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-xs text-muted">Median EV</p>
          <p className="figures text-3xl font-semibold">
            <Money value={med} />
          </p>
          <p className="mt-1 text-sm text-muted">
            Mean <Money value={stats.meanEv} className="text-text" />
          </p>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted">
              <span>
                P10 <Money value={spreadLo} className="text-text" />
              </span>
              <span>
                P90 <Money value={spreadHi} className="text-text" />
              </span>
            </div>
            <div className="relative mt-1.5 h-2 rounded-full bg-surface-2" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 right-0 rounded-full bg-border-strong" />
              <span className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-accent" style={{ left: `${medPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">80% of the pooled distribution lies between P10 and P90.</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-1">
          {stats.askingPrice != null ? (
            <div>
              <dt className="text-xs text-muted">Asking price</dt>
              <dd className="figures">
                <Money value={stats.askingPrice} />
              </dd>
            </div>
          ) : null}
          {stats.prAboveAsk != null ? (
            <div>
              <dt className="text-xs text-muted">Pr(EV above ask)</dt>
              <dd className="figures">{pct(stats.prAboveAsk)}</dd>
            </div>
          ) : null}
          {stats.medianToAsk != null ? (
            <div>
              <dt className="text-xs text-muted">Median / ask</dt>
              <dd className="figures">{ratio(stats.medianToAsk)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted">Disagreement</dt>
            <dd>{disagreementWord(stats.disagreement)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Concentration</dt>
            <dd>{concentrationWord(stats.concentration)}</dd>
          </div>
        </dl>
      </div>
      <p className="mt-3 text-xs text-muted">
        {MODEL_DERIVED} Based on {stats.nCount} independent {stats.nCount === 1 ? "valuation" : "valuations"} (effective {stats.nEff.toFixed(1)}) plus a documented baseline.
      </p>
    </div>
  );
}
