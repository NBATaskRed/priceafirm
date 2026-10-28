import Link from "next/link";
import type { ReactNode } from "react";
import { EARNINGS_LABEL, fmtMoney, fmtPts, nwcConvention, type Confidence, type ListingSnapshot } from "@/lib/domain/types";
import type { PublishedStats } from "@/lib/quant/model";

/* ----------------------------------------------------------------------------
 * Card
 * ------------------------------------------------------------------------- */
export function Card({ children, className = "", as: Tag = "div", pad = true }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "li"; pad?: boolean }) {
  return <Tag className={`card ${pad ? "card-pad" : ""} ${className}`}>{children}</Tag>;
}

/* ----------------------------------------------------------------------------
 * Button (also as link)
 * ------------------------------------------------------------------------- */
type Variant = "primary" | "invert" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

function btnClass(variant: Variant, size: Size, className: string) {
  return `btn btn-${variant} ${size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : ""} ${className}`;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button type={type} className={btnClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  size = "md",
  className = "",
  external = false,
}: {
  children: ReactNode;
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  external?: boolean;
}) {
  if (external) {
    return (
      <a href={href} className={btnClass(variant, size, className)} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={btnClass(variant, size, className)}>
      {children}
    </Link>
  );
}

/* ----------------------------------------------------------------------------
 * Money and points
 * ------------------------------------------------------------------------- */
export function Money({ value, compact = true, className = "" }: { value: number | null | undefined; compact?: boolean; className?: string }) {
  return (
    <span className={`figures ${className}`} title={value == null ? undefined : fmtMoney(value)}>
      {fmtMoney(value, { compact })}
    </span>
  );
}

/** Short money for live copy: $2.65M, $8.7M, $680K (spec 4.2 / 4.3). */
export function fmtShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "Unknown";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, "")}M`;
  if (a >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** Points with one decimal and a real minus sign. */
export function fmtPoints(n: number): string {
  return n.toFixed(1).replace("-", "\u2212");
}

/** The header points chip: "3.0 pts", amber on amber tint. */
export function PointsChip({ balance, href = "/points" }: { balance: number; href?: string }) {
  const s = fmtPoints(balance);
  return (
    <Link href={href} className="points-chip figures" aria-label={`${s} points. Open My points.`}>
      {s} pts
    </Link>
  );
}

/** Asking, Revenue and the earnings type as three figure tiles (spec 4.2 item 2). */
export function FactTiles({ snapshot, tone = "surface", className = "" }: { snapshot: Pick<ListingSnapshot, "asking_price" | "revenue" | "earnings" | "earnings_type">; tone?: "surface" | "surface-2"; className?: string }) {
  const tile = tone === "surface" ? "tile" : "tile-2";
  const facts = [
    { label: "Asking", value: snapshot.asking_price },
    { label: "Revenue", value: snapshot.revenue },
    { label: earningsLabel(snapshot.earnings_type), value: snapshot.earnings },
  ];
  return (
    <dl className={`grid grid-cols-3 gap-2 ${className}`}>
      {facts.map((f) => (
        <div key={f.label} className={tile}>
          <dt className="tile-label">{f.label}</dt>
          <dd className="figures mt-0.5 text-[18px] font-bold">{fmtMoney(f.value, { compact: true })}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Short earnings label for tiles and rows. */
export function earningsLabel(t: ListingSnapshot["earnings_type"]): string {
  return t === "unknown" ? "Earnings" : EARNINGS_LABEL[t];
}

/** Signed points, one decimal, with a word so the sign never relies on color. */
export function Points({ value, words = false, className = "" }: { value: number; words?: boolean; className?: string }) {
  const s = fmtPts(value).replace("-", "\u2212");
  const tone = value > 0 ? "text-pos" : value < 0 ? "text-neg" : "text-text";
  return (
    <span className={`figures ${tone} ${className}`}>
      {s}
      {words ? (value > 0 ? " gain" : value < 0 ? " loss" : " no change") : null}
    </span>
  );
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = { low: "Low", medium: "Medium", high: "High" };

/**
 * The frozen possible range for a forecast: "−4.0 to +7.0", with a small proportional bar so the
 * risk/reward shape is visible at a glance. Never color-only: both numbers are printed.
 */
export function PointsRange({ maxLoss, maxGain, showBar = true, className = "" }: { maxLoss: number; maxGain: number; showBar?: boolean; className?: string }) {
  const total = maxLoss + maxGain || 1;
  const lossPct = (maxLoss / total) * 100;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="figures whitespace-nowrap">
        <span className="text-neg">&minus;{maxLoss.toFixed(1)}</span>
        <span className="text-muted"> to </span>
        <span className="text-pos">+{maxGain.toFixed(1)}</span>
      </span>
      {showBar ? (
        <span aria-hidden="true" className="inline-flex h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
          <span className="h-full bg-neg/70" style={{ width: `${lossPct}%` }} />
          <span className="h-full bg-pos/80" style={{ width: `${100 - lossPct}%` }} />
        </span>
      ) : null}
    </span>
  );
}

/** Symmetric possible score "−7.1 to +7.1" (design v2.2: the same for every confidence level). */
export function ScoreRange({ cap, className = "" }: { cap: number; className?: string }) {
  return (
    <span className={`figures whitespace-nowrap ${className}`}>
      <span className="text-neg">&minus;{cap.toFixed(1)}</span>
      <span className="text-muted"> to </span>
      <span className="text-pos">+{cap.toFixed(1)}</span>
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Evidence
 * ------------------------------------------------------------------------- */
export const EVIDENCE_TEXT: Record<PublishedStats["evidence"], string> = {
  none: "No independent valuations yet",
  single: "Single valuation",
  preliminary: "Preliminary (2 valuations)",
  established: "Established (3 or more)",
};

export function evidenceFor(n: number): PublishedStats["evidence"] {
  if (n <= 0) return "none";
  if (n === 1) return "single";
  if (n === 2) return "preliminary";
  return "established";
}

export function valuationsText(n: number): string {
  if (n <= 0) return "No independent valuations yet";
  if (n === 1) return "1 independent valuation";
  return `${n} independent valuations`;
}

/** The count line next to every buyers' figure (spec 4.5). */
export function basedOnText(n: number): string {
  if (n <= 0) return "No independent valuations yet";
  if (n === 1) return "Based on 1 independent valuation";
  if (n === 2) return "Based on 2 independent valuations, preliminary";
  return `Based on ${n} independent valuations`;
}

export function EvidenceBadge({ nCount, className = "" }: { nCount: number; evidence?: PublishedStats["evidence"]; className?: string }) {
  return <span className={`chip ${className}`}>{basedOnText(nCount)}</span>;
}

/* ----------------------------------------------------------------------------
 * Neutral facts grid
 * ------------------------------------------------------------------------- */
export function locationText(s: Pick<ListingSnapshot, "region" | "state" | "metro">): string {
  return [s.region, s.state, s.metro].filter(Boolean).join(" · ") || "Location not stated";
}

/** "Tampa Bay, FL": metro and state, for headers and rows. */
export function placeText(s: Pick<ListingSnapshot, "region" | "state" | "metro">): string {
  return [s.metro, s.state].filter(Boolean).join(", ") || s.region || "Location not stated";
}

/** "2 other buyers have valued this so far" (spec 4.2 item 2). */
export function othersValuedText(n: number): string {
  if (n <= 0) return "No one has valued this yet";
  return n === 1 ? "1 other buyer has valued this so far" : `${n} other buyers have valued this so far`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "Unknown";
  const date = new Date(d.length === 10 ? `${d}T00:00:00Z` : d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function yesNo(v: boolean | null): string {
  return v == null ? "Not stated" : v ? "Yes" : "No";
}

export function FactsGrid({ snapshot, dense = false, showAsk = true }: { snapshot: ListingSnapshot; dense?: boolean; showAsk?: boolean }) {
  const facts: Array<{ label: string; value: ReactNode }> = [
    { label: "Industry", value: snapshot.industry },
    { label: "Location", value: locationText(snapshot) },
  ];
  if (showAsk) {
    facts.push({
      label: "Asking price",
      value: <Money value={snapshot.asking_price} />,
    });
  }
  facts.push(
    {
      label: snapshot.revenue_period ? `Revenue (${snapshot.revenue_period})` : "Revenue",
      value: <Money value={snapshot.revenue} />,
    },
    {
      label: snapshot.earnings_type === "unknown" ? "Earnings" : EARNINGS_LABEL[snapshot.earnings_type],
      value: (
        <>
          <Money value={snapshot.earnings} />
          {snapshot.earnings_type === "unknown" && snapshot.earnings != null ? <span className="block text-xs text-muted">{EARNINGS_LABEL.unknown}</span> : null}
        </>
      ),
    },
    { label: "Snapshot date", value: <span className="figures">{fmtDate(snapshot.snapshot_date)}</span> },
  );
  if (!dense) {
    facts.push(
      { label: "Inventory included", value: yesNo(snapshot.includes_inventory) },
      { label: "Real estate included", value: yesNo(snapshot.includes_real_estate) },
      { label: "Working capital", value: nwcConvention(snapshot) === "included" ? "Included" : nwcConvention(snapshot) === "excluded" ? "Excluded" : "Unresolved" },
    );
    if (snapshot.industry_tags?.length) facts.push({ label: "Tags", value: snapshot.industry_tags.join(", ") });
    if (snapshot.deal_terms_note) facts.push({ label: "Deal terms note", value: snapshot.deal_terms_note });
  }
  return (
    <dl className={`grid gap-x-6 gap-y-3 ${dense ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
      {facts.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-xs text-muted">{f.label}</dt>
          <dd className="mt-0.5 break-words text-[15px]">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ----------------------------------------------------------------------------
 * Notice and empty state
 * ------------------------------------------------------------------------- */
export function Notice({ tone = "info", title, children, className = "" }: { tone?: "info" | "warn" | "error" | "success"; title?: string; children?: ReactNode; className?: string }) {
  const border = tone === "error" ? "border-neg/60" : tone === "warn" ? "border-accent/60" : tone === "success" ? "border-pos/60" : "border-border-strong";
  const word = tone === "error" ? "Error" : tone === "warn" ? "Note" : tone === "success" ? "Done" : "";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-[var(--radius-card)] border ${border} bg-surface px-4 py-3 text-sm ${className}`}>
      {title ? (
        <p className="font-semibold">
          {word && !title.startsWith(word) ? <span className="sr-only">{word}: </span> : null}
          {title}
        </p>
      ) : null}
      {children ? <div className={`${title ? "mt-1" : ""} text-text-soft`}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card card-pad flex flex-col items-start gap-3 border-dashed">
      <p className="text-[17px] font-semibold">{title}</p>
      {children ? <div className="text-sm text-muted">{children}</div> : null}
      {action}
    </div>
  );
}

export function PageHeader({ title, lede, aside }: { title: string; lede?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-[620px]">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] md:text-[40px] md:leading-[1.1]">{title}</h1>
        {lede ? <div className="mt-2.5 text-[15px] leading-relaxed text-text-soft md:text-[17px]">{lede}</div> : null}
      </div>
      {aside}
    </header>
  );
}

export const BALANCE_SENTENCE = "Your balance may rise or fall as additional independent opinions arrive.";
export const MODEL_DERIVED = "Model estimates from buyers' valuations, not offers.";
