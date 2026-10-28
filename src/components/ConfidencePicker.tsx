"use client";

import { useId, useRef } from "react";
import type { Confidence } from "@/lib/domain/types";
import { assumedRange } from "@/lib/quant/model";
import { CONFIDENCE_LABEL, fmtShort } from "./ui";

const ORDER: Confidence[] = ["low", "medium", "high"];

const TAIL: Record<Confidence, string> = {
  low: "Small gains, small losses, whatever other buyers say.",
  medium: "You earn more when later valuations land near yours.",
  high: "Biggest gains if later valuations land near yours, biggest losses if they don't.",
};

/** Live copy under the pills (spec 4.2 item 5). */
export function confidenceCopy(confidence: Confidence | null, estimate: number | null): string {
  if (!confidence) return "Pick one. It sets the range we assume around your number, not the points at stake.";
  if (!estimate) return "Type a number to see the range we assume for it.";
  const r = assumedRange(estimate, confidence);
  return `${CONFIDENCE_LABEL[confidence]}: we assume roughly ${fmtShort(r.lo)} to ${fmtShort(r.hi)}. ${TAIL[confidence]}`;
}

/**
 * "How sure are you?" Three equal pills in a radio group. Points at stake are the same for every
 * level; confidence sets the assumed range around the number and how sharply later valuations move
 * the score either way.
 */
export function ConfidencePicker({
  value,
  onChange,
  estimate,
  name = "confidence",
  disabled = false,
}: {
  value: Confidence | null;
  onChange: (c: Confidence) => void;
  /** Current EV estimate in dollars, or null when nothing typed yet. */
  estimate: number | null;
  /** Unused since spec v1.1 (points at stake sit in their own tile); kept for call-site compatibility. */
  cap?: number;
  name?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusIdx = value ? ORDER.indexOf(value) : 0;

  function move(from: number, delta: number) {
    const next = (from + delta + ORDER.length) % ORDER.length;
    onChange(ORDER[next]);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span id={`${id}-label`} className="text-[17px] font-semibold">
        How sure are you?
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-copy`} className="grid grid-cols-3 gap-2">
        {ORDER.map((c, i) => (
          <button
            key={c}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === c}
            tabIndex={i === focusIdx ? 0 : -1}
            disabled={disabled}
            className="pill"
            onClick={() => onChange(c)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
          >
            {CONFIDENCE_LABEL[c]}
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value ?? ""} />
      <p id={`${id}-copy`} className="text-sm leading-[1.45] text-text-soft" aria-live="polite">
        {confidenceCopy(value, estimate)}
      </p>
    </div>
  );
}
