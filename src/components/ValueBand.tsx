import type { Confidence } from "@/lib/domain/types";
import { assumedRange } from "@/lib/quant/model";
import { fmtShort } from "./ui";

/** Log scale around the listing: ask / 3 to ask x 3 by default (spec 4.2 item 4). */
export function bandScale(ask: number | null | undefined, fallback: number | null | undefined): { lo: number; hi: number } | null {
  const center = ask && ask > 0 ? ask : fallback && fallback > 0 ? fallback : null;
  if (!center) return null;
  return { lo: center / 3, hi: center * 3 };
}

function posFn(scale: { lo: number; hi: number }) {
  const lmin = Math.log(scale.lo);
  const lmax = Math.log(scale.hi);
  return (n: number) => Math.max(0, Math.min(100, ((Math.log(Math.max(n, 1)) - lmin) / (lmax - lmin)) * 100));
}

function Ends({ scale, caption }: { scale: { lo: number; hi: number } | null; caption: string | null }) {
  return (
    <div className="flex justify-between gap-2 text-xs text-muted" aria-hidden="true">
      <span className="figures">{scale ? fmtShort(scale.lo) : ""}</span>
      <span>{caption}</span>
      <span className="figures">{scale ? fmtShort(scale.hi) : ""}</span>
    </div>
  );
}

/**
 * The signature element: a track around the asking price, a grey tick for the ask, the assumed range in
 * translucent amber and the number as an amber dot. Band and dot animate left/width (350 ms, none with
 * reduced motion; see .band-anim in globals.css).
 */
export function ValueBand({ ask, value, confidence }: { ask: number | null; value: number | null; confidence: Confidence | null }) {
  const scale = bandScale(ask, value);
  const pos = scale ? posFn(scale) : null;
  const range = value && confidence ? assumedRange(value, confidence) : null;
  const hasAsk = ask != null && ask > 0;
  const left = pos && range ? pos(range.lo) : 0;
  const width = pos && range ? Math.max(2, pos(range.hi) - left) : 0;

  const desc = [
    hasAsk ? `Asking price ${fmtShort(ask)}.` : "No asking price listed.",
    value ? `Your number ${fmtShort(value)}.` : "No number yet.",
    range ? `Assumed range ${fmtShort(range.lo)} to ${fmtShort(range.hi)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section aria-label="Your assumed range against the asking price" className="flex flex-col gap-2">
      <div className="relative h-11" role="img" aria-label={desc}>
        <div className="band-track top-5" />
        {range && pos ? <div className="band-range band-anim top-3 h-5" style={{ left: `${left}%`, width: `${width}%` }} /> : null}
        {hasAsk && pos ? <div className="band-ask top-1 h-9" style={{ left: `${pos(ask)}%` }} /> : null}
        {value && pos ? <div className="band-dot band-anim top-3.5 -ml-2 h-4 w-4" style={{ left: `${pos(value)}%` }} /> : null}
      </div>
      <Ends scale={scale} caption={hasAsk ? "Grey line is the asking price" : null} />
    </section>
  );
}

/** "What buyers think so far" band: P10 to P90 with the ask tick and your dot (spec 4.3). */
export function BuyersBand({ ask, p10, p90, median, you }: { ask: number | null; p10: number | null; p90: number | null; median: number | null; you: number | null }) {
  const scale = bandScale(ask, median);
  if (!scale) return null;
  const s = { lo: Math.min(scale.lo, p10 ?? scale.lo, you ?? scale.lo) * 0.95, hi: Math.max(scale.hi, p90 ?? scale.hi, you ?? scale.hi) * 1.05 };
  const pos = posFn(s);
  const hasAsk = ask != null && ask > 0;
  const left = p10 != null ? pos(p10) : null;
  const width = p10 != null && p90 != null ? Math.max(2, pos(p90) - pos(p10)) : null;
  const desc = [
    p10 != null && p90 != null ? `Buyers' range ${fmtShort(p10)} to ${fmtShort(p90)}.` : "",
    hasAsk ? `Asking price ${fmtShort(ask)}.` : "",
    you ? `Your number ${fmtShort(you)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-9" role="img" aria-label={desc}>
        <div className="band-track top-4" />
        {left != null && width != null ? <div className="band-crowd top-2.5 h-4" style={{ left: `${left}%`, width: `${width}%` }} /> : null}
        {hasAsk ? <div className="band-ask top-0.5 h-8" style={{ left: `${pos(ask)}%` }} /> : null}
        {you ? <div className="band-dot top-[11px] -ml-[7px] h-3.5 w-3.5" style={{ left: `${pos(you)}%` }} /> : null}
      </div>
      <Ends scale={s} caption={hasAsk ? "Grey line is the asking price" : null} />
    </div>
  );
}
