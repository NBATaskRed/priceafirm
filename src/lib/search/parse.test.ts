import { describe, expect, it } from "vitest";
import { parseSearchText } from "./parse";

const BRIEF_QUERY =
  "B2B businesses in Georgia or Florida with at least $300,000 SDE or $500,000 EBITDA, under $5 million asking, preferably recurring commercial customers; exclude restaurants";

describe("parseSearchText: brief example", () => {
  const f = parseSearchText(BRIEF_QUERY);

  it("finds both states", () => {
    expect([...f.states].sort()).toEqual(["FL", "GA"]);
  });
  it("keeps SDE and EBITDA minimums separate", () => {
    expect(f.sdeMin).toBe(300_000);
    expect(f.ebitdaMin).toBe(500_000);
    expect(f.cashFlowMin).toBeUndefined();
  });
  it("reads the asking ceiling", () => {
    expect(f.askMax).toBe(5_000_000);
    expect(f.askMin).toBeUndefined();
  });
  it("captures industries, exclusions and descriptors", () => {
    expect(f.industries.some((i) => i.includes("b2b"))).toBe(true);
    expect(f.excludeIndustries).toContain("restaurant");
    expect(f.industries).not.toContain("restaurant");
    expect(f.descriptors).toContain("recurring");
    expect(f.descriptors).toContain("commercial customers");
  });
  it("is deterministic", () => {
    expect(parseSearchText(BRIEF_QUERY)).toEqual(f);
  });
});

describe("parseSearchText: geography", () => {
  it("handles codes and names in lists", () => {
    expect(parseSearchText("hvac in GA or FL").states.sort()).toEqual(["FL", "GA"]);
    expect(parseSearchText("Georgia and Florida plumbing").states.sort()).toEqual(["FL", "GA"]);
    expect(parseSearchText("TX, NC and South Carolina").states.sort()).toEqual(["NC", "SC", "TX"]);
    expect(parseSearchText("ga or fl landscaping").states.sort()).toEqual(["FL", "GA"]);
  });
  it("does not mistake ordinary words for codes", () => {
    const f = parseSearchText("in or near manufacturing with me as operator");
    expect(f.states).toEqual([]);
  });
  it("maps region words", () => {
    expect(parseSearchText("southeast manufacturing").regions).toEqual(["Southeast US"]);
    expect(parseSearchText("midwest trucking").regions).toEqual(["Midwest US"]);
    expect(parseSearchText("Texas distribution").states).toEqual(["TX"]);
    expect(parseSearchText("pacific northwest saas").regions).toEqual(["Pacific Northwest"]);
  });
});

describe("parseSearchText: money", () => {
  it("parses k/M/million/mm", () => {
    expect(parseSearchText("asking under $4M").askMax).toBe(4_000_000);
    expect(parseSearchText("price below 2.5 million").askMax).toBe(2_500_000);
    expect(parseSearchText("ask up to $750k").askMax).toBe(750_000);
    expect(parseSearchText("EBITDA over $1.2mm").ebitdaMin).toBe(1_200_000);
  });
  it("handles plus and at least phrasing", () => {
    expect(parseSearchText("SDE of $300k+").sdeMin).toBe(300_000);
    expect(parseSearchText("$300k+ SDE").sdeMin).toBe(300_000);
    expect(parseSearchText("minimum $400,000 cash flow").cashFlowMin).toBe(400_000);
    expect(parseSearchText("cash flow at least 250k").cashFlowMin).toBe(250_000);
    expect(parseSearchText("min EBITDA $1M").ebitdaMin).toBe(1_000_000);
  });
  it("handles revenue bounds", () => {
    expect(parseSearchText("revenue above $2M").revenueMin).toBe(2_000_000);
    expect(parseSearchText("less than $10M in revenue").revenueMax).toBe(10_000_000);
    const r = parseSearchText("revenue between $2M and $8M");
    expect(r.revenueMin).toBe(2_000_000);
    expect(r.revenueMax).toBe(8_000_000);
  });
  it("treats a bare ceiling as askMax and ignores a bare amount", () => {
    expect(parseSearchText("hvac under $3M").askMax).toBe(3_000_000);
    expect(parseSearchText("hvac below 3 million").askMax).toBe(3_000_000);
    const bare = parseSearchText("hvac company $3M");
    expect(bare.askMax).toBeUndefined();
    expect(bare.askMin).toBeUndefined();
    expect(bare.sdeMin).toBeUndefined();
  });
  it("does not treat counts or years as money", () => {
    const f = parseSearchText("established 20 years with 15 employees and 3 trucks");
    expect(f.askMax).toBeUndefined();
    expect(f.askMin).toBeUndefined();
  });
});

describe("parseSearchText: industries and exclusions", () => {
  it("recognizes dictionary keywords", () => {
    expect(parseSearchText("HVAC or plumbing").industries.sort()).toEqual(["hvac", "plumbing"]);
    expect(parseSearchText("industrial maintenance").industries.sort()).toEqual(["industrial", "maintenance"]);
    expect(parseSearchText("SaaS or software").industries.sort()).toEqual(["saas", "software"]);
    expect(parseSearchText("e-commerce brands").industries).toContain("e-commerce");
    expect(parseSearchText("dental practices").industries).toContain("dental");
  });
  it("captures exclusions after several cue words", () => {
    expect(parseSearchText("home services, no restaurants").excludeIndustries).toEqual(["restaurant"]);
    expect(parseSearchText("manufacturing but not trucking").excludeIndustries).toEqual(["trucking"]);
    expect(parseSearchText("anything without retail or restaurants").excludeIndustries.sort()).toEqual(["restaurant", "retail"]);
    expect(parseSearchText("services except staffing").excludeIndustries).toEqual(["staffing"]);
  });
  it("does not let 'no more than' start an exclusion", () => {
    const f = parseSearchText("restaurants no more than $2M");
    expect(f.excludeIndustries).toEqual([]);
    expect(f.industries).toContain("restaurant");
    expect(f.askMax).toBe(2_000_000);
  });
  it("captures descriptors", () => {
    const f = parseSearchText("absentee franchise with government contracts and recurring revenue");
    expect(f.descriptors).toEqual(expect.arrayContaining(["absentee", "franchise", "government contracts", "recurring"]));
  });
  it("returns empty filters for empty input", () => {
    const f = parseSearchText("   ");
    expect(f.industries).toEqual([]);
    expect(f.states).toEqual([]);
    expect(f.raw).toBe("");
  });
});
