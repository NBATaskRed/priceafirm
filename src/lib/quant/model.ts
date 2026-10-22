/**
 * PriceAFirm quant engine, design v2.2 (pure functions; no I/O).
 *
 * Everything here is an explicitly labeled modeling convention for the pilot, not a calibrated
 * posterior. Parameters are versioned so stored contracts can be recomputed later.
 */
import type { Confidence, EarningsType } from "@/lib/domain/types";
export type { Confidence };

export const KERNEL_VERSION = "kernel-v2";
export const SCORING_VERSION = "quadratic-v3"; // quadratic (L2) proper score vs F_before, affine map, coverage-only cap
export const POOL_VERSION = "pool-v2"; // model prior blended with ask
export const MULTIPLE_TABLE_VERSION = "multiples-v0-placeholder";

/** Section 4.2 kernel widths and aggregation weights (research-only). */
export const SIGMA: Record<Confidence, number> = { low: 0.55, medium: 0.35, high: 0.22 };
export const WEIGHT: Record<Confidence, number> = { low: 0.6, medium: 1.0, high: 1.5 };

export const POOL = {
  kappa: 2,
  maxShareWith4Plus: 0.3,
  minSigma: 0.15,
  priorTau: 0.6, // deliberately wide, uncalibrated
  priorAskWeight: 0.5, // w in mu0 = w*log(M*E) + (1-w)*log A ; here w applies to the model term
  fallbackTauNoAsk: 0.9,
};

export const SCORING = {
  obsSigma: 0.3, // observation-noise floor: later reports are noisy humans, not the true value
  capScale: 10, // C(m) = 10 * d(m)
  newcomerFloor: -3, // cumulative posted loss floor over first 5 scored forecasts
  newcomerCount: 5,
};

/**
 * Section 5.1 multiple table: operator industry-and-size multiples by earnings type and band.
 * PLACEHOLDER values pending Stage 0 (built from the operator's closed-deal history). Versioned.
 */
export const MULTIPLE_TABLE: Record<string, Record<"sde" | "ebitda" | "seller_cash_flow", Array<{ maxEarnings: number; multiple: number }>>> = {
  default: {
    sde: [
      { maxEarnings: 250_000, multiple: 2.3 },
      { maxEarnings: 500_000, multiple: 2.8 },
      { maxEarnings: 1_000_000, multiple: 3.3 },
      { maxEarnings: Infinity, multiple: 3.8 },
    ],
    seller_cash_flow: [
      { maxEarnings: 250_000, multiple: 2.3 },
      { maxEarnings: 500_000, multiple: 2.8 },
      { maxEarnings: 1_000_000, multiple: 3.3 },
      { maxEarnings: Infinity, multiple: 3.8 },
    ],
    ebitda: [
      { maxEarnings: 1_000_000, multiple: 4.0 },
      { maxEarnings: 3_000_000, multiple: 5.0 },
      { maxEarnings: Infinity, multiple: 6.0 },
    ],
  },
  software: {
    sde: [{ maxEarnings: Infinity, multiple: 4.5 }],
    seller_cash_flow: [{ maxEarnings: Infinity, multiple: 4.5 }],
    ebitda: [{ maxEarnings: 1_000_000, multiple: 6.0 }, { maxEarnings: Infinity, multiple: 8.0 }],
  },
  manufacturing: {
    sde: [{ maxEarnings: 500_000, multiple: 3.0 }, { maxEarnings: Infinity, multiple: 3.6 }],
    seller_cash_flow: [{ maxEarnings: 500_000, multiple: 3.0 }, { maxEarnings: Infinity, multiple: 3.6 }],
    ebitda: [{ maxEarnings: 1_000_000, multiple: 4.5 }, { maxEarnings: Infinity, multiple: 5.5 }],
  },
};

export function industryGroup(industry: string, tags: string[] = []): string {
  const hay = `${industry} ${tags.join(" ")}`.toLowerCase();
  if (/software|saas|tech/.test(hay)) return "software";
  if (/manufactur/.test(hay)) return "manufacturing";
  return "default";
}

export function industryMultiple(group: string, earningsType: EarningsType, earnings: number): number | null {
  if (earningsType === "unknown") return null;
  const table = MULTIPLE_TABLE[group] ?? MULTIPLE_TABLE.default;
  const bands = table[earningsType];
  return bands.find((b) => earnings <= b.maxEarnings)?.multiple ?? null;
}

/** A Gaussian mixture on x = log(EV). Serializable; stored in forecast contracts. */
export interface Mixture {
  version: string;
  comps: Array<{ mu: number; sigma: number; w: number; src: "prior" | "human"; ref?: string }>;
  nEff: number;
  nInd: number;
  alpha: number;
  concentration: number;
}

export interface OpinionInput {
  id: string;
  logValue: number;
  confidence: Confidence;
  orgKey: string | null;
}

export interface Prior {
  mu: number;
  sigma: number;
  components: { model: number | null; ask: number | null };
}

/** Section 5.1: model prior blended with the ask (ask is always EV). */
export function prior(opts: { askingPrice: number | null; earnings: number | null; earningsType: EarningsType; industry: string; tags?: string[] }): Prior | null {
  const askLog = opts.askingPrice && opts.askingPrice > 0 ? Math.log(opts.askingPrice) : null;
  let modelLog: number | null = null;
  if (opts.earnings && opts.earnings > 0) {
    const m = industryMultiple(industryGroup(opts.industry, opts.tags), opts.earningsType, opts.earnings);
    if (m) modelLog = Math.log(opts.earnings * m);
  }
  if (askLog == null && modelLog == null) return null;
  if (askLog == null) return { mu: modelLog!, sigma: POOL.fallbackTauNoAsk, components: { model: modelLog, ask: null } };
  if (modelLog == null) return { mu: askLog, sigma: POOL.priorTau, components: { model: null, ask: askLog } };
  const w = POOL.priorAskWeight;
  return { mu: w * modelLog + (1 - w) * askLog, sigma: POOL.priorTau, components: { model: modelLog, ask: askLog } };
}

/**
 * Independence: related accounts (same org cluster) collapse to one voice. Returns n_ind (integer,
 * displayed) and n_eff (Kish effective sample size over cluster weights, internal).
 */
export function effectiveN(opinions: OpinionInput[]): { nEff: number; nInd: number; groups: Array<{ key: string; members: OpinionInput[]; w: number }> } {
  const byOrg = new Map<string, OpinionInput[]>();
  for (const o of opinions) {
    const key = o.orgKey ?? `solo:${o.id}`;
    const arr = byOrg.get(key) ?? [];
    arr.push(o);
    byOrg.set(key, arr);
  }
  const groups = [...byOrg.entries()].map(([key, members]) => ({ key, members, w: Math.max(...members.map((m) => WEIGHT[m.confidence])) }));
  const sw = groups.reduce((a, g) => a + g.w, 0);
  const sw2 = groups.reduce((a, g) => a + g.w * g.w, 0);
  return { nEff: sw2 === 0 ? 0 : (sw * sw) / sw2, nInd: groups.length, groups };
}

/** Section 5.2 conservative mixture-based opinion pool. */
export function buildPool(p: Prior | null, opinions: OpinionInput[]): Mixture {
  const { nEff, nInd, groups } = effectiveN(opinions);
  const alpha = p ? nEff / (nEff + POOL.kappa) : 1;
  const raw: Array<{ o: OpinionInput; a: number }> = [];
  for (const g of groups) {
    const share = g.w / g.members.length;
    for (const o of g.members) raw.push({ o, a: share });
  }
  let total = raw.reduce((s, r) => s + r.a, 0);
  let a = raw.map((r) => (total > 0 ? r.a / total : 0));
  if (nInd >= 4) {
    for (let iter = 0; iter < 10; iter++) {
      const cap = POOL.maxShareWith4Plus;
      if (!a.some((v) => v > cap)) break;
      const excess = a.reduce((s, v) => s + Math.max(0, v - cap), 0);
      const underIdx = a.map((v, i) => (v < cap ? i : -1)).filter((i) => i >= 0);
      const underTotal = underIdx.reduce((s, i) => s + a[i], 0);
      a = a.map((v) => (v > cap ? cap : underTotal > 0 ? v + (excess * v) / underTotal : v));
    }
    total = a.reduce((s, v) => s + v, 0);
    a = a.map((v) => v / total);
  }
  const comps: Mixture["comps"] = [];
  if (p) comps.push({ mu: p.mu, sigma: p.sigma, w: 1 - alpha, src: "prior" });
  raw.forEach((r, i) => comps.push({ mu: r.o.logValue, sigma: Math.max(POOL.minSigma, SIGMA[r.o.confidence]), w: alpha * a[i], src: "human", ref: r.o.id }));
  return { version: POOL_VERSION, comps: comps.filter((c) => c.w > 0), nEff, nInd, alpha, concentration: a.length ? Math.max(...a) : 0 };
}

const SQRT2PI = Math.sqrt(2 * Math.PI);
function normPdf(x: number, mu: number, s: number) {
  const z = (x - mu) / s;
  return Math.exp(-0.5 * z * z) / (s * SQRT2PI);
}
function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}
function normCdf(x: number, mu: number, s: number) {
  return 0.5 * (1 + erf((x - mu) / (s * Math.SQRT2)));
}

export function mixturePdf(m: Mixture, x: number, extraVar = 0): number {
  let p = 0;
  for (const c of m.comps) p += c.w * normPdf(x, c.mu, Math.sqrt(c.sigma * c.sigma + extraVar));
  return p;
}
export function mixtureCdf(m: Mixture, x: number): number {
  let p = 0;
  for (const c of m.comps) p += c.w * normCdf(x, c.mu, c.sigma);
  return p;
}
/** g(y|F): F smoothed by the observation-noise floor (log density; diagnostics only). */
export function logPredictive(m: Mixture, y: number): number {
  return Math.log(Math.max(mixturePdf(m, y, SCORING.obsSigma ** 2), 1e-300));
}

/* ---------------------------------------------------------------------------------------------
 * Scoring rule (design Section 6.3, v2.3): quadratic proper score, no clipping.
 *
 *   q_i      = N(log v_i, sigma_c^2 + obs^2)          the forecaster's smoothed kernel
 *   g        = F_before smoothed by obs^2             the crowd before i, frozen at submission
 *   QS(p, y) = 2 p(y) - integral p^2                  strictly proper, bounded for these p
 *   D_ij     = QS(q_i, y_j) - QS(g, y_j)              y_j = log of a later independent report
 *   score_i  = C(m_i) * mean_j D_ij / R_i
 *
 * R_i is the largest |D| any menu choice can produce against this g (computed from g and the menu,
 * never from the choice), so |score_i| <= C(m_i) always and no clip is ever applied. Every step after
 * QS is affine with choice-independent coefficients, so expected points are maximized exactly by
 * reporting the kernel closest (in L2) to your belief about later reports: honest center, honest width.
 * ------------------------------------------------------------------------------------------- */

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);
const INV_2_SQRT_PI = 1 / (2 * Math.sqrt(Math.PI));

export function kernelSd(confidence: Confidence): number {
  return Math.sqrt(SIGMA[confidence] ** 2 + SCORING.obsSigma ** 2);
}

/** QS of the forecaster's kernel at y. */
export function qsKernel(logValue: number, confidence: Confidence, y: number): number {
  const s = kernelSd(confidence);
  return 2 * normPdf(y, logValue, s) - INV_2_SQRT_PI / s;
}

function smoothed(m: Mixture) {
  return m.comps.map((c) => ({ w: c.w, mu: c.mu, s: Math.sqrt(c.sigma * c.sigma + SCORING.obsSigma ** 2) }));
}

/** integral of g^2 for a Gaussian mixture, in closed form. */
export function mixtureL2(m: Mixture): number {
  const cs = smoothed(m);
  let t = 0;
  for (const a of cs) for (const b of cs) t += a.w * b.w * normPdf(a.mu, b.mu, Math.sqrt(a.s * a.s + b.s * b.s));
  return t;
}

/** QS of the crowd baseline at y. */
export function qsMixture(m: Mixture, y: number): number {
  let p = 0;
  for (const c of smoothed(m)) p += c.w * normPdf(y, c.mu, c.s);
  return 2 * p - mixtureL2(m);
}

/** Choice-independent normalizer: max |D| over every menu kernel, every center and every y. */
export function scoreRange(m: Mixture): number {
  const l2 = mixtureL2(m);
  const peakBound = smoothed(m).reduce((t, c) => t + (c.w * INV_SQRT_2PI) / c.s, 0); // >= max_y g(y)
  let up = 0;
  let down = 0;
  for (const c of ["low", "medium", "high"] as Confidence[]) {
    const s = kernelSd(c);
    up = Math.max(up, 2 * INV_SQRT_2PI / s - INV_2_SQRT_PI / s + l2); // best y for q, worst for g
    down = Math.max(down, INV_2_SQRT_PI / s + 2 * peakBound - l2); // y far from q, at g's peak
  }
  return Math.max(up, down);
}

/** D_ij = QS(q_i, y_j) - QS(g, y_j). Unclipped. */
export function deltaIJ(fBefore: Mixture, logValue: number, confidence: Confidence, yj: number): number {
  return qsKernel(logValue, confidence, yj) - qsMixture(fBefore, yj);
}

/** Affine map to points. The clamp is a safety net that cannot bind (|z| <= R by construction). */
export function mapScore(z: number, capValue: number, range: number): number {
  const x = range > 0 ? z / range : 0;
  return round(capValue * Math.max(-1, Math.min(1, x)), 4);
}

export function scoreForecast(
  contract: { fBefore: Mixture; logValue: number; confidence: Confidence; cap: number },
  laterLogValues: number[],
): { z: number; score: number; laterCount: number } {
  if (!laterLogValues.length) return { z: 0, score: 0, laterCount: 0 };
  const deltas = laterLogValues.map((y) => deltaIJ(contract.fBefore, contract.logValue, contract.confidence, y));
  const z = deltas.reduce((t, d) => t + d, 0) / deltas.length; // plain mean: linear, so propriety survives averaging
  return { z, score: mapScore(z, contract.cap, scoreRange(contract.fBefore)), laterCount: laterLogValues.length };
}

export function mixtureQuantile(m: Mixture, q: number): number {
  if (!m.comps.length) return NaN;
  let lo = Math.min(...m.comps.map((c) => c.mu - 6 * c.sigma));
  let hi = Math.max(...m.comps.map((c) => c.mu + 6 * c.sigma));
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (mixtureCdf(m, mid) < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export function mixtureMean(m: Mixture): number {
  return m.comps.reduce((s, c) => s + c.w * Math.exp(c.mu + 0.5 * c.sigma * c.sigma), 0);
}

export interface PublishedStats {
  nInd: number;
  nEff: number;
  medianEv: number | null;
  meanEv: number | null;
  p10: number | null;
  p90: number | null;
  concentration: number;
  evidence: "none" | "single" | "preliminary" | "established";
  prAboveAsk: number | null;
  medianToAsk: number | null;
  meanToAsk: number | null;
  disagreement: number | null;
}

export function evidenceLabel(n: number): PublishedStats["evidence"] {
  if (n <= 0) return "none";
  if (n === 1) return "single";
  if (n === 2) return "preliminary";
  return "established";
}

/** Section 5.3: numeric figures at any count >= 1; prior-only (no crowd figure) at 0. */
export function publishedStats(m: Mixture, askingPrice: number | null): PublishedStats {
  const base = { nInd: m.nInd, nEff: round(m.nEff, 2), concentration: round(m.concentration, 2), evidence: evidenceLabel(m.nInd) };
  if (m.nInd === 0) {
    return { ...base, medianEv: null, meanEv: null, p10: null, p90: null, prAboveAsk: null, medianToAsk: null, meanToAsk: null, disagreement: null };
  }
  const med = Math.exp(mixtureQuantile(m, 0.5));
  const mean = mixtureMean(m);
  const humans = m.comps.filter((c) => c.src === "human");
  let disagreement: number | null = null;
  if (humans.length >= 2) {
    const mu = humans.reduce((s, c) => s + c.mu, 0) / humans.length;
    disagreement = Math.sqrt(humans.reduce((s, c) => s + (c.mu - mu) ** 2, 0) / (humans.length - 1));
  }
  const hasAsk = !!askingPrice && askingPrice > 0;
  return {
    ...base,
    medianEv: sig3(med),
    meanEv: sig3(mean),
    p10: sig3(Math.exp(mixtureQuantile(m, 0.1))),
    p90: sig3(Math.exp(mixtureQuantile(m, 0.9))),
    prAboveAsk: hasAsk ? round(1 - mixtureCdf(m, Math.log(askingPrice)), 2) : null,
    medianToAsk: hasAsk ? round(med / askingPrice, 2) : null,
    meanToAsk: hasAsk ? round(mean / askingPrice, 2) : null,
    disagreement: disagreement == null ? null : round(disagreement, 2),
  };
}

/** Internal Find Deals ranking input: Pr(EV>ask) shrunk toward 0.5 by thin participation and age. */
export function attractiveness(stats: PublishedStats, snapshotAgeDays: number): number | null {
  if (stats.prAboveAsk == null || stats.nInd === 0) return null;
  const shrink = stats.nEff / (stats.nEff + 1.5);
  return 0.5 + (stats.prAboveAsk - 0.5) * shrink * Math.exp(-snapshotAgeDays / 365);
}

/** Section 6.2: cap depends only on prior coverage, identical across confidence levels. */
export function opportunityFactor(mBefore: number) {
  return 1 / Math.sqrt(1 + Math.max(0, mBefore));
}
export function cap(mBefore: number): number {
  return round(SCORING.capScale * opportunityFactor(mBefore), 2);
}

/** System-assumed central 80% range for the kernel (display only). */
export function assumedRange(value: number, confidence: Confidence): { lo: number; hi: number } {
  const k = Math.exp(1.2816 * SIGMA[confidence]);
  return { lo: value / k, hi: value * k };
}

/**
 * Section 6.2 newcomer floor: given raw scores of an account's first-5 forecasts (in order), return
 * the floored scores such that the cumulative sum never goes below the floor and later positive
 * revisions first restore clipped amounts. Implemented as: floored_total = max(sum, floor), then
 * allocated to forecasts proportionally to their negative parts.
 */
export function applyNewcomerFloor(rawScores: number[], floor = SCORING.newcomerFloor): number[] {
  const sum = rawScores.reduce((s, v) => s + v, 0);
  if (sum >= floor) return rawScores.map((v) => round(v, 4));
  const deficit = floor - sum; // positive amount to give back
  const negTotal = rawScores.reduce((s, v) => s + (v < 0 ? -v : 0), 0);
  if (negTotal === 0) return rawScores.map((v) => round(v, 4));
  return rawScores.map((v) => round(v < 0 ? v + (deficit * -v) / negTotal : v, 4));
}

/** Normalized skill contribution for percentile ranking (Section 11): score / C(m). */
export function normalizedSkill(score: number, capValue: number): number {
  return capValue > 0 ? score / capValue : 0;
}

export function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
export function sig3(n: number) {
  if (!Number.isFinite(n) || n === 0) return n;
  const digits = Math.floor(Math.log10(Math.abs(n)));
  const f = 10 ** (digits - 2);
  return Math.round(n / f) * f;
}
