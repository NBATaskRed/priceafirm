"use client";

import type { Confidence } from "@/lib/domain/types";
import { fmtMoney } from "@/lib/domain/types";
import { assumedRange } from "@/lib/quant/model";
import { CONFIDENCE_LABEL } from "./ui";

const HINT: Record<Confidence, string> = {
  low: "A rough read.",
  medium: "A considered view.",
  high: "You know this kind of business.",
};

/**
 * Confidence choice (design v2.2). The possible score range is the same for every level; confidence
 * sets the system-assumed range around the estimate and therefore how sharply later opinions move
 * the score either way.
 */
export function ConfidencePicker({
  value,
  onChange,
  estimate,
  cap,
  name = "confidence",
  disabled = false,
}: {
  value: Confidence | null;
  onChange: (c: Confidence) => void;
  /** Current EV estimate in dollars, or null when nothing typed yet. */
  estimate: number | null;
  cap: number;
  name?: string;
  disabled?: boolean;
}) {
  const order: Confidence[] = ["low", "medium", "high"];
  return (
    <fieldset disabled={disabled}>
      <legend className="label">Confidence</legend>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
        {order.map((c) => {
          const selected = value === c;
          const r = estimate ? assumedRange(estimate, c) : null;
          return (
            <label key={c} className="conf-option relative" data-selected={selected ? "true" : "false"}>
              <input type="radio" name={name} value={c} checked={selected} onChange={() => onChange(c)} />
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{CONFIDENCE_LABEL[c]}</span>
                {r ? (
                  <span className="figures text-xs text-muted">
                    {fmtMoney(r.lo, { compact: true })} to {fmtMoney(r.hi, { compact: true })}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-xs text-muted">{HINT[c]}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-sm" aria-live="polite">
        {value ? (
          <>
            <span className="font-medium">{CONFIDENCE_LABEL[value]}:</span>{" "}
            {estimate ? (
              <>
                assumed range roughly <span className="figures">{fmtMoney(assumedRange(estimate, value).lo, { compact: true })}</span> to{" "}
                <span className="figures">{fmtMoney(assumedRange(estimate, value).hi, { compact: true })}</span> (system-assumed).{" "}
              </>
            ) : (
              <>enter your estimate to see the system-assumed range. </>
            )}
            Earns more when later independent valuations land near yours, loses more when they don&apos;t. Possible score unchanged:{" "}
            <span className="figures">
              &minus;{cap.toFixed(1)} to +{cap.toFixed(1)}
            </span>
            .
          </>
        ) : (
          <span className="text-muted">Pick a confidence. It changes the assumed range around your number, not the possible score.</span>
        )}
      </p>
    </fieldset>
  );
}
