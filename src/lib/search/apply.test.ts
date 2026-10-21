import { describe, expect, it } from "vitest";
import type { ListingSnapshot } from "@/lib/domain/types";
import { applyFilters, describeFilters } from "./apply";
import { parseSearchText } from "./parse";
import { emptyFilters, type SearchFilters } from "./types";

let seq = 0;
function snap(over: Partial<ListingSnapshot>): ListingSnapshot {
  seq++;
  return {
    id: `s${seq}`,
    business_id: `b${seq}`,
    version: 1,
    source_domain: "example.com",
    headline: "Business",
    industry: "services",
    industry_tags: [],
    region: null,
    state: null,
    metro: null,
    asking_price: null,
    ask_currency: "USD",
    ask_basis: "unknown",
    revenue: null,
    revenue_period: null,
    earnings: null,
    earnings_type: "unknown",
    includes_inventory: null,
    includes_nwc: null,
    includes_real_estate: null,
    includes_cash: null,
    includes_debt: null,
    deal_terms_note: null,
    snapshot_date: "2026-10-01",
    status: "approved",
    submitted_by: null,
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

const BRIEF_QUERY =
  "B2B businesses in Georgia or Florida with at least $300,000 SDE or $500,000 EBITDA, under $5 million asking, preferably recurring commercial customers; exclude restaurants";

describe("applyFilters with the brief query", () => {
  const filters = parseSearchText(BRIEF_QUERY);

  const gaSde = snap({ headline: "Commercial HVAC services", industry: "hvac", industry_tags: ["hvac", "b2b", "services"], state: "GA", asking_price: 2_900_000, earnings: 650_000, earnings_type: "sde" });
  const flEbitda = snap({ headline: "B2B logistics services", industry: "logistics", industry_tags: ["logistics", "b2b", "services"], state: "FL", asking_price: 4_500_000, earnings: 520_000, earnings_type: "ebitda" });
  const flEbitdaLow = snap({ headline: "B2B staffing services", industry: "staffing", industry_tags: ["staffing", "b2b", "services"], state: "FL", asking_price: 1_500_000, earnings: 350_000, earnings_type: "ebitda" });
  const gaSdeLow = snap({ headline: "B2B printing services", industry: "printing", industry_tags: ["printing", "b2b", "services"], state: "GA", asking_price: 900_000, earnings: 280_000, earnings_type: "sde" });
  const txSde = snap({ headline: "B2B plumbing services", industry: "plumbing", industry_tags: ["plumbing", "b2b", "services"], state: "TX", asking_price: 2_000_000, earnings: 700_000, earnings_type: "sde" });
  const restaurant = snap({ headline: "Restaurant", industry: "restaurant", industry_tags: ["restaurant", "b2b", "services"], state: "GA", asking_price: 1_000_000, earnings: 400_000, earnings_type: "sde" });
  const tooExpensive = snap({ headline: "B2B services", industry: "services", industry_tags: ["b2b", "services"], state: "FL", asking_price: 6_000_000, earnings: 900_000, earnings_type: "sde" });
  const unknownAsk = snap({ headline: "B2B services", industry: "services", industry_tags: ["b2b", "services"], state: "FL", asking_price: null, earnings: 900_000, earnings_type: "sde" });
  const unknownEarnings = snap({ headline: "B2B services", industry: "services", industry_tags: ["b2b", "services"], state: "GA", asking_price: 1_000_000, earnings: null, earnings_type: "unknown" });
  const cashFlowOnly = snap({ headline: "B2B services", industry: "services", industry_tags: ["b2b", "services"], state: "GA", asking_price: 1_000_000, earnings: 800_000, earnings_type: "seller_cash_flow" });

  const all = [gaSde, flEbitda, flEbitdaLow, gaSdeLow, txSde, restaurant, tooExpensive, unknownAsk, unknownEarnings, cashFlowOnly];
  const result = applyFilters(filters, all).map((s) => s.id);

  it("keeps listings satisfying the minimum for their own earnings type", () => {
    expect(result).toContain(gaSde.id);
    expect(result).toContain(flEbitda.id);
  });
  it("drops listings below the minimum for their own type", () => {
    expect(result).not.toContain(flEbitdaLow.id);
    expect(result).not.toContain(gaSdeLow.id);
  });
  it("applies geography, exclusions and ask", () => {
    expect(result).not.toContain(txSde.id);
    expect(result).not.toContain(restaurant.id);
    expect(result).not.toContain(tooExpensive.id);
    expect(result).not.toContain(unknownAsk.id);
  });
  it("never matches unknown earnings against a typed minimum, and a cash-flow listing does not satisfy SDE/EBITDA minimums", () => {
    expect(result).not.toContain(unknownEarnings.id);
    expect(result).not.toContain(cashFlowOnly.id);
  });
});

describe("applyFilters: earnings typing", () => {
  const sde = snap({ earnings: 400_000, earnings_type: "sde" });
  const ebitda = snap({ earnings: 400_000, earnings_type: "ebitda" });
  const cf = snap({ earnings: 400_000, earnings_type: "seller_cash_flow" });
  const unknown = snap({ earnings: 400_000, earnings_type: "unknown" });

  it("sdeMin matches only SDE", () => {
    const f: SearchFilters = { ...emptyFilters(), sdeMin: 300_000 };
    expect(applyFilters(f, [sde, ebitda, cf, unknown]).map((s) => s.id)).toEqual([sde.id]);
  });
  it("ebitdaMin matches only EBITDA", () => {
    const f: SearchFilters = { ...emptyFilters(), ebitdaMin: 300_000 };
    expect(applyFilters(f, [sde, ebitda, cf, unknown]).map((s) => s.id)).toEqual([ebitda.id]);
  });
  it("cashFlowMin matches any known type but never unknown", () => {
    const f: SearchFilters = { ...emptyFilters(), cashFlowMin: 300_000 };
    expect(applyFilters(f, [sde, ebitda, cf, unknown]).map((s) => s.id).sort()).toEqual([sde.id, ebitda.id, cf.id].sort());
  });
});

describe("applyFilters: geography, ask, revenue", () => {
  it("matches state or region", () => {
    const ga = snap({ state: "GA" });
    const nc = snap({ state: "NC", region: "Southeast US" });
    const ny = snap({ state: "NY" });
    const noState = snap({ region: "Southeast US" });
    const f: SearchFilters = { ...emptyFilters(), states: ["GA"], regions: ["Southeast US"] };
    expect(applyFilters(f, [ga, nc, ny, noState]).map((s) => s.id).sort()).toEqual([ga.id, nc.id, noState.id].sort());
  });
  it("unknown ask fails an ask constraint; range bounds are inclusive", () => {
    const a = snap({ asking_price: 1_000_000 });
    const b = snap({ asking_price: 5_000_000 });
    const c = snap({ asking_price: 5_000_001 });
    const d = snap({ asking_price: null });
    const f: SearchFilters = { ...emptyFilters(), askMin: 1_000_000, askMax: 5_000_000 };
    expect(applyFilters(f, [a, b, c, d]).map((s) => s.id)).toEqual([a.id, b.id]);
  });
  it("filters revenue", () => {
    const a = snap({ revenue: 3_000_000 });
    const b = snap({ revenue: 1_000_000 });
    const c = snap({ revenue: null });
    const f: SearchFilters = { ...emptyFilters(), revenueMin: 2_000_000 };
    expect(applyFilters(f, [a, b, c]).map((s) => s.id)).toEqual([a.id]);
  });
});

describe("applyFilters: industry synonyms", () => {
  const maint = snap({ headline: "Facility maintenance", industry: "maintenance", industry_tags: ["maintenance"] });
  const indus = snap({ headline: "Industrial equipment services", industry: "industrial", industry_tags: ["industrial"] });
  const hvacB2b = snap({ headline: "Commercial HVAC", industry: "hvac", industry_tags: ["hvac", "b2b"] });
  const hvacOnly = snap({ headline: "Residential HVAC", industry: "hvac", industry_tags: ["hvac"] });
  const b2bServices = snap({ headline: "B2B services", industry: "services", industry_tags: ["b2b", "services"] });
  const cafe = snap({ headline: "Coffee shop", industry: "cafe", industry_tags: [] });

  it("multi-word terms match any of their specific tags", () => {
    const f: SearchFilters = { ...emptyFilters(), industries: ["industrial maintenance"] };
    expect(applyFilters(f, [maint, indus, hvacB2b, cafe]).map((s) => s.id).sort()).toEqual([maint.id, indus.id].sort());
  });
  it("'b2b services' requires both model tags", () => {
    const f: SearchFilters = { ...emptyFilters(), industries: ["b2b services"] };
    expect(applyFilters(f, [b2bServices, hvacOnly, hvacB2b, cafe]).map((s) => s.id)).toEqual([b2bServices.id]);
  });
  it("matches headline text via synonyms when tags are missing", () => {
    const f: SearchFilters = { ...emptyFilters(), industries: ["hvac"] };
    const untagged = snap({ headline: "Heating and air conditioning contractor", industry: "trades", industry_tags: [] });
    expect(applyFilters(f, [untagged, cafe]).map((s) => s.id)).toEqual([untagged.id]);
  });
  it("exclusions use synonyms too", () => {
    const f: SearchFilters = { ...emptyFilters(), excludeIndustries: ["restaurant"] };
    expect(applyFilters(f, [cafe, hvacOnly]).map((s) => s.id)).toEqual([hvacOnly.id]);
  });
});

describe("describeFilters", () => {
  it("produces short chips for the brief query", () => {
    const chips = describeFilters(parseSearchText(BRIEF_QUERY));
    expect(chips).toContain("B2B");
    expect(describeFilters(parseSearchText("b2b services in GA under $5M"))).toContain("B2B services");
    expect(chips.some((c) => c === "GA/FL" || c === "FL/GA")).toBe(true);
    expect(chips).toContain("SDE ≥ $300K");
    expect(chips).toContain("EBITDA ≥ $500K");
    expect(chips).toContain("Ask < $5M");
    expect(chips).toContain("Excludes restaurants");
    expect(chips).toContain("Recurring revenue");
  });
  it("formats ranges", () => {
    const f: SearchFilters = { ...emptyFilters(), revenueMin: 2_000_000, revenueMax: 8_000_000, askMin: 1_000_000 };
    const chips = describeFilters(f);
    expect(chips).toContain("Revenue $2M–$8M");
    expect(chips).toContain("Ask ≥ $1M");
  });
});
