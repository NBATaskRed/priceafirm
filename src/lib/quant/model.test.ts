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
  kernelSd,
  mapScore,
  scoreRange,
  qsKernel,
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

describe("proper scoring (Section 6.3): exact incentive compatibility", () => {
  const LEVELS: Confidence[] = ["low", "medium", "high"];
  // Crowd states to test against: prior only, and priors with human reports on either side.
  const crowds = [
    buildPool(P, []),
    buildPool(P, [op("a", 2.0e6, "high"), op("b", 2.2e6, "medium")]),
    buildPool(P, [op("a", 4.5e6, "low"), op("b", 5.0e6, "high"), op("c", 1.6e6, "medium"), op("d", 3.1e6, "medium")]),
  ];
  // E[f(Y)] for Y ~ N(m, sd^2) by fine quadrature (error << differences being tested).
  const expectN = (m: number, sd: number, f: (y: number) => number) => {
    let e = 0, w = 0;
    for (let k = 0; k <= 4000; k++) {
      const z = -8 + (16 * k) / 4000;
      const wt = Math.exp(-0.5 * z * z);
      e += wt * f(m + z * sd);
      w += wt;
    }
    return e / w;
  };
  const expScore = (F: ReturnType<typeof buildPool>, report: number, c: Confidence, m: number, sd: number) =>
    expectN(m, sd, (y) => scoreForecast({ fBefore: F, logValue: report, confidence: c, cap: 10 }, [y]).score);

  it("zero with no later evidence; |score| <= cap", () => {
    expect(scoreForecast({ fBefore: crowds[0], logValue: Math.log(2e6), confidence: "medium", cap: 10 }, [])).toEqual({ z: 0, score: 0, laterCount: 0 });
    expect(mapScore(99, 7.07, 1)).toBe(7.07);
  });

  it("the normalizer bounds every possible difference, so the clamp never binds", () => {
    for (const F of crowds) {
      const R = scoreRange(F);
      for (const c of LEVELS)
        for (let v = Math.log(2e5); v <= Math.log(5e7); v += 0.25)
          for (let y = Math.log(1e5); y <= Math.log(1e8); y += 0.05) expect(Math.abs(deltaIJ(F, v, c, y))).toBeLessThanOrEqual(R + 1e-12);
    }
  });

  it("honest width wins: for each true spread, the matching level has the highest expected points", () => {
    for (const F of crowds)
      for (const gap of [-1, -0.5, 0, 0.5, 1]) {
        const m = buildPool(P, []).comps[0].mu + gap;
        for (const truth of LEVELS) {
          const sd = kernelSd(truth); // true belief about later reports = this level's total spread
          const e = Object.fromEntries(LEVELS.map((c) => [c, expScore(F, m, c, m, sd)])) as Record<Confidence, number>;
          for (const c of LEVELS) if (c !== truth) expect(e[truth]).toBeGreaterThan(e[c]);
        }
      }
  });

  it("honest center wins: shading the number toward or away from the crowd always lowers expected points", () => {
    for (const F of crowds)
      for (const gap of [-1, 0, 0.6, 1.2]) {
        const m = buildPool(P, []).comps[0].mu + gap;
        for (const c of LEVELS) {
          const honest = expScore(F, m, c, m, kernelSd(c));
          for (const off of [-0.4, -0.2, -0.05, 0.05, 0.2, 0.4]) expect(honest).toBeGreaterThan(expScore(F, m + off, c, m, kernelSd(c)));
        }
      }
  });

  it("expected points = constant - L2 distance between belief and kernel (any belief, even bimodal)", () => {
    // Belief: 50/50 mixture of two lognormal humps. E[QS(q,Y)] = integral p^2 - integral (q-p)^2.
    const F = crowds[1];
    const R = scoreRange(F);
    const humps = [{ m: Math.log(1.8e6), s: 0.25 }, { m: Math.log(3.6e6), s: 0.25 }];
    const pdf = (y: number) => humps.reduce((t, h) => t + 0.5 * Math.exp(-0.5 * ((y - h.m) / h.s) ** 2) / (h.s * Math.sqrt(2 * Math.PI)), 0);
    const grid: number[] = [];
    for (let y = Math.log(2e5); y <= Math.log(5e7); y += 0.002) grid.push(y);
    const dy = 0.002;
    const results = [];
    for (const c of LEVELS)
      for (let v = Math.log(1.5e6); v <= Math.log(4.5e6); v += 0.1) {
        const sd = kernelSd(c);
        const q = (y: number) => Math.exp(-0.5 * ((y - v) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
        let e = 0, l2 = 0;
        for (const y of grid) {
          e += pdf(y) * scoreForecast({ fBefore: F, logValue: v, confidence: c, cap: 10 }, [y]).score * dy;
          l2 += (q(y) - pdf(y)) ** 2 * dy;
        }
        results.push({ e, l2 });
      }
    // Points are an exact decreasing affine function of the L2 distance: slope -10/R.
    const [a, b] = [results[0], results[results.length - 1]];
    const slope = (b.e - a.e) / (b.l2 - a.l2);
    expect(slope).toBeCloseTo(-10 / R, 3);
    for (const r of results) expect(r.e - a.e).toBeCloseTo(slope * (r.l2 - a.l2), 3);
  });

  it("High earns more when later reports land near, loses more when they land two Medium-widths away", () => {
    const F = crowds[0];
    const v = Math.log(2e6);
    const sc = (c: Confidence, y: number) => scoreForecast({ fBefore: F, logValue: v, confidence: c, cap: 10 }, [y]).score;
    expect(sc("high", v + 0.02)).toBeGreaterThan(sc("medium", v + 0.02));
    expect(sc("high", v + 2 * SIGMA.medium)).toBeLessThan(sc("medium", v + 2 * SIGMA.medium));
    expect(qsKernel(v, "high", v)).toBeGreaterThan(qsKernel(v, "low", v));
  });

  it("averaging several later judges keeps the score inside the cap", () => {
    const F = crowds[2];
    const r = scoreForecast({ fBefore: F, logValue: Math.log(3e6), confidence: "high", cap: 5 }, [Math.log(2.9e6), Math.log(3.2e6), Math.log(9e6), Math.log(1e6)]);
    expect(Math.abs(r.score)).toBeLessThanOrEqual(5);
    expect(r.laterCount).toBe(4);
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
