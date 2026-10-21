import { describe, expect, it } from "vitest";
import {
  SIGMA,
  applyNewcomerFloor,
  assumedRange,
  attractiveness,
  buildPool,
  cap,
  deltaIJ,
  effectiveN,
  logKernel,
  mapScore,
  mixtureCdf,
  mixtureQuantile,
  prior,
  publishedStats,
  scoreForecast,
  type Confidence,
  type OpinionInput,
} from "./model";

const op = (id: string, v: number, c: Confidence = "medium", org: string | null = null): OpinionInput => ({ id, logValue: Math.log(v), confidence: c, orgKey: org });
const P = prior({ askingPrice: 2_900_000, earnings: 680_000, earningsType: "sde", industry: "HVAC services" })!;

describe("cap (Section 6.2)", () => {
  it("matches the table and does not depend on confidence", () => {
    expect(cap(0)).toBe(10);
    expect(cap(1)).toBe(7.07);
    expect(cap(3)).toBe(5);
    expect(cap(9)).toBe(3.16);
  });
  it("assumed ranges widen with lower confidence", () => {
    const l = assumedRange(1e6, "low");
    const h = assumedRange(1e6, "high");
    expect(l.hi - l.lo).toBeGreaterThan(h.hi - h.lo);
    expect(h.hi / 1e6).toBeCloseTo(1.33, 1);
  });
});

describe("prior (Section 5.1)", () => {
  it("blends model multiple and ask, falls back to each alone", () => {
    expect(P.components.model).not.toBeNull();
    expect(P.components.ask).toBeCloseTo(Math.log(2_900_000), 6);
    expect(Math.exp(P.mu)).toBeGreaterThan(1_500_000);
    const askOnly = prior({ askingPrice: 2e6, earnings: null, earningsType: "unknown", industry: "x" })!;
    expect(askOnly.mu).toBeCloseTo(Math.log(2e6), 6);
    const modelOnly = prior({ askingPrice: null, earnings: 1e6, earningsType: "ebitda", industry: "manufacturing" })!;
    expect(Math.exp(modelOnly.mu)).toBeCloseTo(4.5e6, -3);
    expect(prior({ askingPrice: null, earnings: null, earningsType: "unknown", industry: "x" })).toBeNull();
  });
});

describe("independence and pool", () => {
  it("n_ind counts clusters once", () => {
    const r = effectiveN([op("a", 1e6, "medium", "firm"), op("b", 2e6, "medium", "firm"), op("c", 3e6)]);
    expect(r.nInd).toBe(2);
    expect(r.nEff).toBe(2);
  });
  it("zero forecasts: prior only, no crowd figure", () => {
    const s = publishedStats(buildPool(P, []), 2_900_000);
    expect(s.nInd).toBe(0);
    expect(s.medianEv).toBeNull();
    expect(s.evidence).toBe("none");
  });
  it("one forecast publishes numeric figures with count 1", () => {
    const s = publishedStats(buildPool(P, [op("a", 2_650_000)]), 2_900_000);
    expect(s.nInd).toBe(1);
    expect(s.evidence).toBe("single");
    expect(s.medianEv).not.toBeNull();
    expect(s.medianToAsk).not.toBeNull();
  });
  it("caps any single voice at 30% with 4+ independent", () => {
    const m = buildPool(P, [op("a", 3e6, "high"), op("b", 2.5e6, "low"), op("c", 2.6e6, "low"), op("d", 2.7e6, "low"), op("e", 2.4e6, "low")]);
    expect(m.concentration).toBeLessThanOrEqual(0.3001);
  });
  it("preserves bimodality", () => {
    const m = buildPool(null, [op("a", 1e6, "high"), op("b", 1e6, "high"), op("c", 4e6, "high"), op("d", 4e6, "high")]);
    expect(Math.exp(mixtureQuantile(m, 0.25))).toBeLessThan(1.5e6);
    expect(Math.exp(mixtureQuantile(m, 0.75))).toBeGreaterThan(3e6);
    expect(mixtureCdf(m, Math.log(2e6))).toBeCloseTo(0.5, 1);
  });
});

describe("proper scoring (Section 6.3)", () => {
  const fBefore = buildPool(P, []);
  it("zero with no later evidence; bounded by the cap; sign follows agreement", () => {
    expect(scoreForecast({ fBefore, logValue: Math.log(2e6), confidence: "medium", cap: 10 }, [])).toEqual({ z: 0, score: 0, laterCount: 0 });
    const near = scoreForecast({ fBefore, logValue: Math.log(2e6), confidence: "high", cap: 10 }, [Math.log(2.05e6), Math.log(1.95e6)]);
    const far = scoreForecast({ fBefore, logValue: Math.log(8e6), confidence: "high", cap: 10 }, [Math.log(2.05e6), Math.log(1.95e6)]);
    expect(near.score).toBeGreaterThan(0);
    expect(far.score).toBeLessThan(0);
    expect(Math.abs(near.score)).toBeLessThanOrEqual(10);
    expect(Math.abs(far.score)).toBeLessThanOrEqual(10);
    expect(mapScore(99, 7.07)).toBe(7.07);
    expect(mapScore(-99, 7.07)).toBe(-7.07);
  });
  it("High earns more when later reports land near, loses more when they land two Medium-widths away", () => {
    const v = Math.log(2e6);
    const nearY = [v + 0.05];
    const farY = [v + 2 * SIGMA.medium];
    const hiNear = scoreForecast({ fBefore, logValue: v, confidence: "high", cap: 10 }, nearY).score;
    const medNear = scoreForecast({ fBefore, logValue: v, confidence: "medium", cap: 10 }, nearY).score;
    const hiFar = scoreForecast({ fBefore, logValue: v, confidence: "high", cap: 10 }, farY).score;
    const medFar = scoreForecast({ fBefore, logValue: v, confidence: "medium", cap: 10 }, farY).score;
    expect(hiNear).toBeGreaterThan(medNear);
    expect(hiFar).toBeLessThan(medFar);
  });
  it("honest confidence maximizes expected score (acceptance test 6)", () => {
    // Agents whose true uncertainty about later reports matches each kernel width.
    const v = Math.log(2.5e6);
    const confs: Confidence[] = ["low", "medium", "high"];
    for (const truth of confs) {
      const sTrue = Math.sqrt(SIGMA[truth] ** 2 + 0.3 ** 2); // later report spread the agent actually believes
      const expected: Record<Confidence, number> = { low: 0, medium: 0, high: 0 };
      // deterministic quadrature over the agent's belief
      const n = 401;
      for (let k = 0; k < n; k++) {
        const z = -4 + (8 * k) / (n - 1);
        const y = v + z * sTrue;
        const w = Math.exp(-0.5 * z * z);
        for (const c of confs) expected[c] += w * mapScore(deltaIJ(fBefore, v, c, y), 10);
      }
      const best = confs.reduce((a, b) => (expected[a] >= expected[b] ? a : b));
      expect(best).toBe(truth);
    }
  });
  it("logKernel integrates the smoothed kernel", () => {
    expect(logKernel(0, "medium", 0)).toBeGreaterThan(logKernel(0, "medium", 1));
  });
});

describe("newcomer floor", () => {
  it("floors cumulative posted loss at -3 and restores clipped amounts first", () => {
    const floored = applyNewcomerFloor([-2.0, -1.7, -1.5]); // raw sum -5.2
    expect(floored.reduce((s, v) => s + v, 0)).toBeCloseTo(-3, 4);
    const after = applyNewcomerFloor([-2.0, -1.7, -1.5 + 1.5]); // +1.5 revision -> raw -3.7
    expect(after.reduce((s, v) => s + v, 0)).toBeCloseTo(-3, 4); // still clipped; balance unchanged
    const later = applyNewcomerFloor([-2.0, -1.7, 1.5]); // raw -2.2 -> above floor, posted as is
    expect(later.reduce((s, v) => s + v, 0)).toBeCloseTo(-2.2, 4);
    expect(applyNewcomerFloor([1, -0.5])).toEqual([1, -0.5]);
  });
});

describe("attractiveness", () => {
  it("null without evidence; shrinks toward 0.5 when thin", () => {
    expect(attractiveness(publishedStats(buildPool(P, []), 2.9e6), 10)).toBeNull();
    const one = publishedStats(buildPool(P, [op("a", 5e6, "high")]), 2.9e6);
    const a = attractiveness(one, 10)!;
    expect(a).toBeGreaterThan(0.5);
    expect(a - 0.5).toBeLessThan(one.prAboveAsk! - 0.5);
  });
});
