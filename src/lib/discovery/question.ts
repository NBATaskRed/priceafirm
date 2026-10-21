import "server-only";
import { valuationQuestion, type ValuationQuestion } from "@/lib/quant/service";
import { cap } from "@/lib/quant/model";

export type QuestionView = ValuationQuestion;

export async function loadQuestion(snapshotId: string): Promise<QuestionView | null> {
  return valuationQuestion(snapshotId);
}

/** Possible score cap for a listing given its current effective participation (coverage only). */
export function capFromParticipation(mBefore: number): number {
  return cap(mBefore);
}
