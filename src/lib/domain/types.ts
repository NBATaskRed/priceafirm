export type Confidence = "low" | "medium" | "high";
export type EarningsType = "sde" | "ebitda" | "seller_cash_flow" | "unknown";
export type SnapshotStatus = "draft" | "pending_review" | "approved" | "withdrawn";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  org_key: string | null;
  role: "member" | "admin";
  invited: boolean;
  trust_status: "normal" | "watch" | "frozen";
  accepted_terms_version: string | null;
  accepted_terms_at: string | null;
  buyer_profile: Record<string, unknown>;
  /** Cumulative amount clipped by the newcomer floor over the first 5 scored forecasts. */
  first5_floor_clipped: number;
  password_set: boolean;
}

/** Neutral, non-identifying listing facts. Safe to show in the Value queue. */
export interface ListingSnapshot {
  id: string;
  business_id: string;
  version: number;
  source_domain: string;
  headline: string;
  industry: string;
  industry_tags: string[];
  region: string | null;
  state: string | null;
  metro: string | null;
  asking_price: number | null;
  ask_currency: string;
  revenue: number | null;
  revenue_period: string | null;
  earnings: number | null;
  earnings_type: EarningsType;
  includes_inventory: boolean | null;
  includes_nwc: boolean | null;
  includes_real_estate: boolean | null;
  deal_terms_note: string | null;
  snapshot_date: string;
  /** Independent valuations on file (n_ind); identical on every surface. */
  independent_count: number;
  status: SnapshotStatus;
  submitted_by: string | null;
  created_at: string;
}

export interface SourceDomain {
  domain: string;
  status: "allowed" | "blocked" | "review";
  source_type: "operator" | "third_party" | "excluded";
  publisher: string | null;
  attribution_text: string | null;
  complaint_received_at: string | null;
  removed_at: string | null;
  removal_reason: string | null;
  notes: string | null;
}
/** @deprecated v2.0 name; kept so ingestion code compiles. */
export type SourceRights = SourceDomain;

export interface ForecastRow {
  id: string;
  user_id: string;
  business_id: string;
  snapshot_id: string;
  value: number;
  log_value: number;
  confidence: Confidence;
  sigma: number;
  weight: number;
  org_key: string | null;
  m_before: number;
  cap: number;
  kernel_version: string;
  scoring_version: string;
  f_before: unknown;
  information_level: "listing" | "cim";
  counts_toward_independent: boolean;
  voided_at: string | null;
  eligible: boolean;
  eligibility_reason: string | null;
  raw_score: number;
  current_score: number;
  created_at: string;
}

export interface LedgerRow {
  id: number;
  user_id: string;
  kind: "WELCOME_GRANT" | "URL_REVEAL" | "URL_REVEAL_FREE" | "SCORE_CHANGE" | "REFUND" | "ADMIN_ADJUSTMENT";
  amount: number;
  forecast_id: string | null;
  business_id: string | null;
  note: string | null;
  created_at: string;
}

/** Working-capital convention (Section 3). Explicit deal terms override. */
export function nwcConvention(s: Pick<ListingSnapshot, "earnings" | "earnings_type" | "includes_nwc">): "included" | "excluded" | "unresolved" {
  if (s.includes_nwc === true) return "included";
  if (s.includes_nwc === false) return "excluded";
  if (s.earnings == null || s.earnings_type === "unknown") return "unresolved";
  return s.earnings >= 1_000_000 ? "included" : "excluded";
}

/** v2.2: the asking price is always treated as EV. True whenever an ask exists. */
export function askComparable(s: Pick<ListingSnapshot, "asking_price">): boolean {
  return s.asking_price != null && s.asking_price > 0;
}

/** Reveal pricing: free below 3 independent valuations, 1 point at 3 or more. */
export const PAID_REVEAL_THRESHOLD = 3;
export function revealCost(independentCount: number): 0 | 1 {
  return independentCount >= PAID_REVEAL_THRESHOLD ? 1 : 0;
}

/** Implied multiple shown live on the form: EV / reported earnings. */
export function impliedMultiple(ev: number, s: Pick<ListingSnapshot, "earnings" | "earnings_type">): string | null {
  if (!s.earnings || s.earnings <= 0 || s.earnings_type === "unknown" || !(ev > 0)) return null;
  return `${(ev / s.earnings).toFixed(1)}x ${EARNINGS_LABEL[s.earnings_type]}`;
}

export const EARNINGS_LABEL: Record<EarningsType, string> = {
  sde: "SDE",
  ebitda: "EBITDA",
  seller_cash_flow: "Seller cash flow",
  unknown: "Earnings basis unknown",
};

export function fmtMoney(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null || Number.isNaN(n)) return "Unknown";
  if (opts.compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  }
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtPts(n: number): string {
  const s = n.toFixed(1);
  return n > 0 ? `+${s}` : s;
}
