"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { impliedMultiple as impliedMultipleBase, type Confidence, type EarningsType } from "@/lib/domain/types";
import { submitForecastAction, type SubmitForecastResult } from "@/lib/actions/forecast";
import { Button, Notice } from "./ui";
import { ConfidencePicker } from "./ConfidencePicker";
import { EvInput } from "./MoneyInput";
import { TermsCheckbox } from "./TermsCheckbox";
import { ValueBand } from "./ValueBand";

export function impliedMultiple(value: number | null, earnings: number | null, earningsType: EarningsType): string | null {
  if (!value) return null;
  const m = impliedMultipleBase(value, { earnings, earnings_type: earningsType });
  return m ? `= ${m}` : null;
}

/** "Points at stake ±C" (spec 4.2 item 6), or the changed-stake line after bounds_changed. */
export function StakeTile({ cap, changed = false }: { cap: number; changed?: boolean }) {
  const c = `±${cap.toFixed(1)}`;
  if (changed) {
    return (
      <div role="status" className="tile flex items-baseline justify-between gap-3 border border-accent px-3.5 py-3">
        <span className="text-sm text-text-soft">
          Points at stake changed to <span className="figures font-bold text-text">{c}</span> because another buyer just valued this
        </span>
      </div>
    );
  }
  return (
    <div className="tile flex items-baseline justify-between gap-3 px-3.5 py-3">
      <span className="text-sm text-muted">Points at stake</span>
      <span className="figures text-[20px] font-bold">{c}</span>
    </div>
  );
}

/**
 * The valuation form (spec 4.2 items 3 to 6): figure input with live multiple, value band, "How sure
 * are you?" pills with live copy, points at stake and "Lock in my valuation". The server action
 * contract (snapshotId, value, confidence, contractToken, rationale, acceptTerms) is unchanged.
 */
export function ValuationForm({
  snapshotId,
  contractToken: initialToken,
  cap: initialCap,
  ask = null,
  earnings,
  earningsType,
  needsTerms,
  compact = false,
  onSealed,
}: {
  snapshotId: string;
  contractToken: string;
  cap: number;
  /** Independent valuations on file; shown by the page header, kept for call-site compatibility. */
  nInd: number;
  /** Asking price, for the value band. */
  ask?: number | null;
  earnings: number | null;
  earningsType: EarningsType;
  needsTerms: boolean;
  compact?: boolean;
  /** Override the default redirect to the done page. */
  onSealed?: (r: Extract<SubmitForecastResult, { status: "sealed" }>) => void;
}) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [rationale, setRationale] = useState("");
  const [terms, setTerms] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [cap, setCap] = useState(initialCap);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: "error" | "warn" | "info"; title?: string; body: string } | null>(null);
  const [needsReconfirm, setNeedsReconfirm] = useState(false);
  const [done, setDone] = useState(false);

  const digits = value.replace(/[^0-9]/g, "");
  const estimate = digits ? Number(digits) : null;
  const valueOk = estimate != null && estimate > 0;
  const canSubmit = valueOk && confidence != null && (!needsTerms || terms) && !pending && !done;
  const multiple = impliedMultiple(estimate, earnings, earningsType);

  function submit(formEl: HTMLFormElement) {
    const fd = new FormData(formEl);
    fd.set("snapshotId", snapshotId);
    fd.set("value", digits);
    fd.set("contractToken", token);
    if (confidence) fd.set("confidence", confidence);
    if (terms) fd.set("acceptTerms", "true");
    setNotice(null);
    start(async () => {
      const r = await submitForecastAction(fd);
      switch (r.status) {
        case "sealed":
          setDone(true);
          if (onSealed) onSealed(r);
          else router.push(`/value/${snapshotId}/done`);
          return;
        case "bounds_changed":
          setToken(r.contractToken);
          setCap(r.cap);
          setNeedsReconfirm(true);
          return;
        case "terms_required":
          setNotice({ tone: "warn", body: r.message });
          return;
        default:
          setNotice({ tone: "error", body: r.message });
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) submit(e.currentTarget);
      }}
    >
      <input type="hidden" name="snapshotId" value={snapshotId} />
      <input type="hidden" name="contractToken" value={token} />

      <EvInput
        id={`ev-${id}`}
        label="What do you think it's worth?"
        value={value}
        onChange={(v) => {
          setValue(v);
        }}
        multiple={multiple}
        autoFocus={!compact}
      />

      <ValueBand ask={ask} value={valueOk ? estimate : null} confidence={confidence} />

      <ConfidencePicker value={confidence} onChange={(c) => setConfidence(c)} estimate={valueOk ? estimate : null} />

      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center text-muted hover:text-text">Add a private note (optional)</summary>
        <label htmlFor={`why-${id}`} className="label mt-1">
          Why you picked this number. Only you see it.
        </label>
        <textarea
          id={`why-${id}`}
          name="rationale"
          className="input"
          maxLength={500}
          rows={3}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          aria-describedby={`why-hint-${id}`}
        />
        <p id={`why-hint-${id}`} className="mt-1 flex justify-between gap-3 text-xs text-muted">
          <span>Leave out anything confidential or covered by an NDA.</span>
          <span className="figures">{rationale.length}/500</span>
        </p>
      </details>

      {notice ? (
        <Notice tone={notice.tone} title={notice.title}>
          {notice.body}
        </Notice>
      ) : null}

      <div className={`flex flex-col gap-2.5 ${compact ? "" : "sticky bottom-[72px] z-10 -mx-5 bg-bg px-5 pb-3 pt-2 md:static md:mx-0 md:bg-transparent md:p-0"}`}>
        <StakeTile cap={cap} changed={needsReconfirm} />
        {needsTerms ? <TermsCheckbox checked={terms} onChange={setTerms} id={`terms-${id}`} /> : null}
        <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
          {pending ? "Locking in" : done ? "Locked in" : "Lock in my valuation"}
        </Button>
      </div>
    </form>
  );
}
