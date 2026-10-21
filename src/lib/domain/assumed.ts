import type { Confidence } from "./types";

/** Section 4.2 illustrative sigmas on log EV; duplicated here so client components can use them. */
export const SIGMA_BY_CONFIDENCE: Record<Confidence, number> = { low: 0.55, medium: 0.35, high: 0.22 };

/** System-assumed 80% range implied by a confidence choice: value ÷ k to value × k, k = exp(1.2816·σ). */
export function assumedRange(value: number, confidence: Confidence): { low: number; high: number; k: number } {
  const k = Math.exp(1.2816 * SIGMA_BY_CONFIDENCE[confidence]);
  return { low: value / k, high: value * k, k };
}

/** Reveal pricing (design v2.2): free below 3 independent valuations, 1 point at 3 or more. */
export const REVEAL_FREE_BELOW = 3;
export function revealCost(independentCount: number): 0 | 1 {
  return independentCount >= REVEAL_FREE_BELOW ? 1 : 0;
}
