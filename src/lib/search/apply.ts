import type { ListingSnapshot } from "@/lib/domain/types";
import { fmtMoney } from "@/lib/domain/types";
import { REGIONS } from "@/lib/sources/usStates";
import { expandIndustryTerm, industryLabel, industryPattern, INDUSTRY_SYNONYMS } from "./industries";
import type { SearchFilters } from "./types";

/**
 * Apply parsed filters to neutral snapshot facts. Pure. Uses only fields a member may see in the
 * Value queue; never touches crowd statistics or identifying source details.
 */

const STATE_TO_REGION: Record<string, string> = {};
for (const [region, codes] of Object.entries(REGIONS)) for (const c of codes) STATE_TO_REGION[c] = region;

function snapshotText(s: ListingSnapshot): string {
  return [s.industry, s.headline, ...(s.industry_tags ?? [])].filter(Boolean).join(" | ").toLowerCase();
}

/** Does the snapshot match a single dictionary tag (or literal term)? */
function matchesTag(s: ListingSnapshot, tag: string, text: string): boolean {
  const tags = (s.industry_tags ?? []).map((t) => t.toLowerCase());
  if (tags.includes(tag) || s.industry.toLowerCase() === tag) return true;
  const re = industryPattern(tag);
  if (re) return re.test(text);
  // Literal fallback for terms outside the dictionary.
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${esc}(?:e?s)?(?![a-z0-9])`, "i").test(text);
}

/**
 * A multi-word term such as "industrial maintenance" expands to its dictionary tags and matches when ANY of them
 * matches (OR), except that a generic model tag (b2b, services, recurring) combined with a specific tag requires the
 * specific tag plus the generic one when both can be checked ("b2b services" -> b2b AND services).
 */
function matchesTerm(s: ListingSnapshot, term: string, text: string): boolean {
  const tags = expandIndustryTerm(term);
  if (!tags.length) return true;
  if (tags.length === 1) return matchesTag(s, tags[0], text);
  const generic: string[] = tags.filter((t) => t === "b2b" || t === "b2c" || t === "services" || t === "recurring");
  const specific = tags.filter((t) => !generic.includes(t));
  if (generic.length && !specific.length) {
    // e.g. "b2b services": both are model words; require all of them.
    return tags.every((t) => matchesTag(s, t, text));
  }
  // e.g. "industrial maintenance" -> industrial OR maintenance; "b2b hvac" -> hvac (b2b is a soft preference).
  return specific.some((t) => matchesTag(s, t, text));
}

function matchesAnyIndustry(s: ListingSnapshot, terms: string[]): boolean {
  if (!terms.length) return true;
  const text = snapshotText(s);
  return terms.some((t) => matchesTerm(s, t, text));
}

function excludedBy(s: ListingSnapshot, terms: string[]): boolean {
  if (!terms.length) return false;
  const text = snapshotText(s);
  return terms.some((term) => expandIndustryTerm(term).some((tag) => matchesTag(s, tag, text)));
}

function matchesGeography(s: ListingSnapshot, f: SearchFilters): boolean {
  if (!f.states.length && !f.regions.length) return true;
  const state = s.state?.toUpperCase() ?? null;
  if (state && f.states.includes(state)) return true;
  const region = s.region ?? (state ? STATE_TO_REGION[state] : null);
  if (region && f.regions.includes(region)) return true;
  // A region filter also admits states that belong to it even when region is not stored.
  if (state && f.regions.some((r) => REGIONS[r]?.includes(state))) return true;
  return false;
}

function matchesAsk(s: ListingSnapshot, f: SearchFilters): boolean {
  if (f.askMin == null && f.askMax == null) return true;
  const ask = s.asking_price;
  if (ask == null || ask <= 0) return false; // unknown ask fails an ask constraint
  if (f.askMin != null && ask < f.askMin) return false;
  if (f.askMax != null && ask > f.askMax) return false;
  return true;
}

function matchesRevenue(s: ListingSnapshot, f: SearchFilters): boolean {
  if (f.revenueMin == null && f.revenueMax == null) return true;
  const rev = s.revenue;
  if (rev == null || rev <= 0) return false;
  if (f.revenueMin != null && rev < f.revenueMin) return false;
  if (f.revenueMax != null && rev > f.revenueMax) return false;
  return true;
}

/**
 * Earnings minimums are typed. sdeMin applies only to SDE listings, ebitdaMin only to EBITDA listings, cashFlowMin to
 * any known type. When several typed minimums are set, a listing passes if it satisfies the minimum for ITS OWN type.
 * Unknown earnings never satisfy a minimum.
 */
function matchesEarnings(s: ListingSnapshot, f: SearchFilters): boolean {
  const anyMin = f.sdeMin != null || f.ebitdaMin != null || f.cashFlowMin != null;
  if (!anyMin) return true;
  const e = s.earnings;
  const type = s.earnings_type;
  if (e == null || e <= 0 || type === "unknown") return false;

  const applicable: number[] = [];
  if (type === "sde" && f.sdeMin != null) applicable.push(f.sdeMin);
  if (type === "ebitda" && f.ebitdaMin != null) applicable.push(f.ebitdaMin);
  if (f.cashFlowMin != null) applicable.push(f.cashFlowMin);

  if (applicable.length) return applicable.some((min) => e >= min);
  // A typed minimum exists but not for this listing's type (e.g. only sdeMin set and listing reports EBITDA): no match.
  return false;
}

export function matchesFilters(filters: SearchFilters, s: ListingSnapshot): boolean {
  if (!matchesGeography(s, filters)) return false;
  if (!matchesAsk(s, filters)) return false;
  if (!matchesRevenue(s, filters)) return false;
  if (!matchesEarnings(s, filters)) return false;
  if (!matchesAnyIndustry(s, filters.industries)) return false;
  if (excludedBy(s, filters.excludeIndustries)) return false;
  return true;
}

export function applyFilters(filters: SearchFilters, snapshots: ListingSnapshot[]): ListingSnapshot[] {
  return snapshots.filter((s) => matchesFilters(filters, s));
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

function money(n: number): string {
  return fmtMoney(n, { compact: true });
}

const REGION_SHORT: Record<string, string> = {
  "Southeast US": "Southeast",
  "Northeast US": "Northeast",
  "Midwest US": "Midwest",
  "Southwest US": "Southwest",
  "West US": "West",
  "South Central US": "South Central",
  "Mountain West": "Mountain West",
  "Pacific Northwest": "Pacific NW",
};

function descriptorLabel(d: string): string {
  const known: Record<string, string> = {
    recurring: "Recurring revenue",
    "commercial customers": "Commercial customers",
    b2b: "B2B",
    b2c: "B2C",
    "government contracts": "Government contracts",
    franchise: "Franchise",
    absentee: "Absentee-friendly",
    "owner-operated": "Owner-operated",
    "management in place": "Management in place",
    relocatable: "Relocatable",
    "home-based": "Home-based",
    "seller financing": "Seller financing",
    "real estate included": "Real estate included",
    established: "Established",
    growing: "Growing",
  };
  return known[d] ?? industryLabel(d);
}

export function describeFilters(filters: SearchFilters): string[] {
  const chips: string[] = [];
  const seen = new Set<string>();
  const push = (c: string) => {
    if (c && !seen.has(c)) {
      seen.add(c);
      chips.push(c);
    }
  };

  for (const ind of filters.industries) push(industryLabel(ind));
  if (filters.states.length) push(filters.states.map((s) => s.toUpperCase()).join("/"));
  for (const r of filters.regions) push(REGION_SHORT[r] ?? r);

  if (filters.sdeMin != null) push(`SDE ≥ ${money(filters.sdeMin)}`);
  if (filters.ebitdaMin != null) push(`EBITDA ≥ ${money(filters.ebitdaMin)}`);
  if (filters.cashFlowMin != null) push(`Cash flow ≥ ${money(filters.cashFlowMin)}`);

  if (filters.revenueMin != null && filters.revenueMax != null) push(`Revenue ${money(filters.revenueMin)}–${money(filters.revenueMax)}`);
  else if (filters.revenueMin != null) push(`Revenue ≥ ${money(filters.revenueMin)}`);
  else if (filters.revenueMax != null) push(`Revenue ≤ ${money(filters.revenueMax)}`);

  if (filters.askMin != null && filters.askMax != null) push(`Ask ${money(filters.askMin)}–${money(filters.askMax)}`);
  else if (filters.askMin != null) push(`Ask ≥ ${money(filters.askMin)}`);
  else if (filters.askMax != null) push(`Ask < ${money(filters.askMax)}`);

  for (const d of filters.descriptors) {
    // Avoid repeating a model word already shown as an industry chip (e.g. "B2B services" + "B2B").
    const label = descriptorLabel(d);
    const dup = filters.industries.some((i) => i.toLowerCase().includes(d.toLowerCase()));
    if (!dup) push(label);
  }

  for (const ex of filters.excludeIndustries) {
    const plural = INDUSTRY_SYNONYMS[ex] ? pluralize(industryLabel(ex)) : industryLabel(ex);
    push(`Excludes ${plural.charAt(0).toLowerCase() + plural.slice(1)}`);
  }
  return chips;
}

function pluralize(label: string): string {
  const lower = label.toLowerCase();
  if (/(?:s|x|z|ch|sh)$/.test(lower) || /^(?:hvac|b2b|b2c|saas|software|healthcare|e-commerce|construction|manufacturing|logistics|trucking|plumbing|electrical|landscaping|staffing|distribution|maintenance|industrial|recurring|retail|insurance|accounting|marketing|education|fitness|security|printing|automotive|dental)$/.test(lower)) {
    return label;
  }
  return `${label}s`;
}
