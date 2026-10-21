import "server-only";
import { valuationQuestion } from "@/lib/quant/service";
import { bounds } from "@/lib/quant/model";
import type { ListingSnapshot } from "@/lib/domain/types";

/**
 * View of the valuation question used by the UI (design v2.2): one symmetric possible score
 * range (±cap) shared by all confidence levels, plus the independent valuation count.
 * Reads the quant service loosely so it works across the v2.1 -> v2.2 field rename.
 */
export interface QuestionView {
  snapshot: ListingSnapshot;
  nInd: number;
  cap: number;
  contractToken: string;
}

export async function loadQuestion(snapshotId: string): Promise<QuestionView | null> {
  const q = (await valuationQuestion(snapshotId)) as unknown as Record<string, unknown> | null;
  if (!q) return null;
  const snapshot = q.snapshot as ListingSnapshot;
  const mBefore = Number(q.mBefore ?? 0);
  const nInd = Number(q.nInd ?? q.nCount ?? (snapshot as unknown as { independent_count?: number }).independent_count ?? 0);
  const cap = Number(q.cap ?? capFromParticipation(mBefore));
  return { snapshot, nInd, cap, contractToken: String(q.contractToken) };
}

/** Fallback cap when the service does not supply one: the High-confidence max gain for this participation level. */
export function capFromParticipation(mBefore: number): number {
  return bounds("high", mBefore).maxGain;
}

/** Independent valuations on a snapshot, preferring the denormalized column when present. */
export function snapshotCount(s: ListingSnapshot & { independent_count?: number | null }, aggCount: number): number {
  return s.independent_count ?? aggCount;
}
