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
type Variant = "primary" | "secondary" | "ghost";
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

/** Signed points, one decimal, with a word so the sign never relies on color. */
export function Points({ value, words = false, className = "" }: { value: number; words?: boolean; className?: string }) {
  const s = fmtPts(value).replace("-", "−");
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
  none: "Ask benchmark only",
  very_limited: "Very limited evidence",
  preliminary: "Preliminary evidence",
  moderate: "Moderate evidence",
  many: "Many valuations",
};

export function valuationsText(n: number): string {
  if (n <= 0) return "No independent valuations yet";
  if (n === 1) return "1 independent valuation";
  return `${n} independent valuations`;
}

export function EvidenceBadge({ nCount, evidence, className = "" }: { nCount: number; evidence?: PublishedStats["evidence"]; className?: string }) {
  const level: PublishedStats["evidence"] = evidence ?? (nCount <= 0 ? "none" : nCount === 1 ? "very_limited" : nCount <= 4 ? "preliminary" : nCount <= 9 ? "moderate" : "many");
  return (
    <span className={`chip ${className}`}>
      <span>{EVIDENCE_TEXT[level]}</span>
      <span className="text-muted">&nbsp;·&nbsp;</span>
      <span className="figures">{nCount <= 0 ? "no crowd valuation yet" : `${nCount} independent ${nCount === 1 ? "valuation" : "valuations"}`}</span>
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Neutral facts grid
 * ------------------------------------------------------------------------- */
export function locationText(s: Pick<ListingSnapshot, "region" | "state" | "metro">): string {
  return [s.region, s.state, s.metro].filter(Boolean).join(" · ") || "Location not stated";
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
      {children ? <div className={`${title ? "mt-1" : ""} text-text/90`}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card card-pad flex flex-col items-start gap-3 border-dashed">
      <p className="text-base font-semibold">{title}</p>
      {children ? <div className="text-sm text-muted">{children}</div> : null}
      {action}
    </div>
  );
}

export function PageHeader({ title, lede, aside }: { title: string; lede?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-2xl sm:text-[1.75rem]">{title}</h1>
        {lede ? <p className="mt-1.5 text-[15px] text-muted">{lede}</p> : null}
      </div>
      {aside}
    </header>
  );
}

export const BALANCE_SENTENCE = "Your balance may rise or fall as additional independent opinions arrive.";
export const MODEL_DERIVED = "Model-derived, not an offer or observed price.";
