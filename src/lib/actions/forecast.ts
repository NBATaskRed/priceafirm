"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { acceptTerms, hasAcceptedTerms, requireMember } from "@/lib/auth/session";
import { sealForecast } from "@/lib/quant/service";
import { loadQuestion } from "@/lib/discovery/question";
import { forecastRateLimited, parseMoney, str } from "./guards";

const schema = z.object({
  snapshotId: z.string().uuid(),
  value: z.number().int().positive().max(1e11),
  confidence: z.enum(["low", "medium", "high"]),
  contractToken: z.string().min(1).max(200),
  rationale: z.string().max(500).optional(),
  acceptTerms: z.boolean(),
});

export type SubmitForecastResult =
  | { status: "sealed"; snapshotId: string; forecastId: string; cap: number }
  | { status: "bounds_changed"; contractToken: string; cap: number; nInd: number; message: string }
  | { status: "terms_required"; message: string }
  | { status: "rate_limited"; message: string }
  | { status: "exposed" | "already_submitted" | "invalid" | "frozen" | "snapshot_not_approved"; message: string };

/**
 * Seal one blind valuation. Enforces: membership, terms acknowledgement, the daily forecast cap,
 * and the frozen-contract echo (bounds_changed when the range moved while the form was open).
 */
export async function submitForecastAction(formData: FormData): Promise<SubmitForecastResult> {
  const { user, profile } = await requireMember();

  const parsed = schema.safeParse({
    snapshotId: str(formData, "snapshotId"),
    value: parseMoney(str(formData, "value")) ?? -1,
    confidence: str(formData, "confidence"),
    contractToken: str(formData, "contractToken"),
    rationale: str(formData, "rationale") || undefined,
    acceptTerms: str(formData, "acceptTerms") === "on" || str(formData, "acceptTerms") === "true",
  });
  if (!parsed.success) {
    const valueIssue = parsed.error.issues.find((i) => i.path[0] === "value");
    return {
      status: "invalid",
      message: valueIssue ? "Enter a positive enterprise value in whole dollars." : "Check the form and try again.",
    };
  }
  const input = parsed.data;

  if (!hasAcceptedTerms(profile)) {
    if (!input.acceptTerms) {
      return { status: "terms_required", message: "Acknowledge the contribution terms before your first valuation." };
    }
    await acceptTerms(user.id);
  }

  if (await forecastRateLimited(user.id)) {
    return { status: "rate_limited", message: "You have reached the limit of 20 valuations in 24 hours. Come back tomorrow." };
  }

  let result;
  try {
    result = await sealForecast({
      userId: user.id,
      snapshotId: input.snapshotId,
      value: input.value,
      confidence: input.confidence,
      contractToken: input.contractToken,
      rationale: input.rationale ?? null,
    });
  } catch (err) {
    console.error("sealForecast failed", err);
    return { status: "invalid", message: "Could not record the valuation. Try again in a moment." };
  }

  if (result.status === "sealed") {
    revalidatePath("/value");
    revalidatePath("/points");
    revalidatePath(`/value/${input.snapshotId}`);
    const sealed = result as unknown as { bounds?: { maxGain: number }; cap?: number };
    return { status: "sealed", snapshotId: input.snapshotId, forecastId: result.forecastId, cap: Number(sealed.cap ?? sealed.bounds?.maxGain ?? 0) };
  }
  if (result.status === "bounds_changed") {
    const fresh = await loadQuestion(input.snapshotId);
    return {
      status: "bounds_changed",
      contractToken: fresh?.contractToken ?? result.question.contractToken,
      cap: fresh?.cap ?? 0,
      nInd: fresh?.nInd ?? 0,
      message: "Another independent valuation arrived while this form was open, so the possible score range changed. Confirm the new range to submit.",
    };
  }
  return { status: result.status, message: result.message };
}

/** Fresh question for a snapshot (used after bounds_changed and by the Add flow). */
export async function currentQuestionAction(snapshotId: string): Promise<{ contractToken: string; cap: number; nInd: number } | null> {
  await requireMember();
  if (!z.string().uuid().safeParse(snapshotId).success) return null;
  const q = await loadQuestion(snapshotId);
  if (!q) return null;
  return { contractToken: q.contractToken, cap: q.cap, nInd: q.nInd };
}
