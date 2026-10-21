"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EARNINGS_LABEL, type Confidence, type EarningsType } from "@/lib/domain/types";
import { submitForecastAction, type SubmitForecastResult } from "@/lib/actions/forecast";
import { Button, Notice, ScoreRange } from "./ui";
import { ConfidencePicker } from "./ConfidencePicker";
import { MoneyInput } from "./MoneyInput";
import { TermsCheckbox } from "./TermsCheckbox";

export function impliedMultiple(value: number | null, earnings: number | null, earningsType: EarningsType): string | null {
  if (!value || !earnings || earnings <= 0 || earningsType === "unknown") return null;
  return `= ${(value / earnings).toFixed(1)}x ${EARNINGS_LABEL[earningsType]}`;
}

export function ValuationForm({
  snapshotId,
  contractToken: initialToken,
  cap: initialCap,
  nInd: initialNInd,
  earnings,
  earningsType,
  needsTerms,
  compact = false,
  onSealed,
}: {
  snapshotId: string;
  contractToken: string;
  cap: number;
  nInd: number;
  earnings: number | null;
  earningsType: EarningsType;
  needsTerms: boolean;
  compact?: boolean;
  /** Override the default redirect to the done page. */
  onSealed?: (r: Extract<SubmitForecastResult, { status: "sealed" }>) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [rationale, setRationale] = useState("");
  const [terms, setTerms] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [cap, setCap] = useState(initialCap);
  const [nInd, setNInd] = useState(initialNInd);
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
          setNInd(r.nInd);
          setNeedsReconfirm(true);
          setNotice({ tone: "warn", title: "The possible score range changed", body: r.message });
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
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) submit(e.currentTarget);
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">
          Independent valuations on file: <span className="figures text-text">{nInd}</span>
        </span>
        <span className="text-muted">
          Possible score: <ScoreRange cap={cap} />
        </span>
      </div>

      <MoneyInput
        label="Your enterprise value estimate"
        name="value"
        value={value}
        onChange={setValue}
        required
        autoFocus={!compact}
        hint={multiple ? `${multiple} · cash-free, debt-free enterprise value in whole US dollars.` : "Cash-free, debt-free enterprise value in whole US dollars. One number, your central estimate."}
      />

      <ConfidencePicker value={confidence} onChange={(c) => setConfidence(c)} estimate={estimate} cap={cap} />

      {needsReconfirm ? (
        <div className="rounded-[var(--radius-card)] border border-accent/60 bg-surface p-3 text-sm">
          <p className="font-medium">New possible score</p>
          <p className="mt-1">
            <ScoreRange cap={cap} /> · {nInd} independent {nInd === 1 ? "valuation" : "valuations"} now on file
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor={`why-${snapshotId}`} className="label">
          Why? <span className="text-muted">(optional, private, 500 characters)</span>
        </label>
        <textarea
          id={`why-${snapshotId}`}
          name="rationale"
          className="input"
          maxLength={500}
          rows={3}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Your reasoning, for your own record."
          aria-describedby={`why-hint-${snapshotId}`}
        />
        <p id={`why-hint-${snapshotId}`} className="mt-1 flex justify-between text-xs text-muted">
          <span>Do not include confidential or NDA-restricted information. Nobody else sees this note.</span>
          <span className="figures">{rationale.length}/500</span>
        </p>
      </div>

      {needsTerms ? <TermsCheckbox checked={terms} onChange={setTerms} id={`terms-${snapshotId}`} /> : null}

      {notice ? (
        <Notice tone={notice.tone} title={notice.title}>
          {notice.body}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size={compact ? "md" : "lg"} disabled={!canSubmit}>
          {pending ? "Sealing" : needsReconfirm ? "Confirm new range and submit" : done ? "Sealed" : "Submit valuation"}
        </Button>
        <span className="text-sm text-muted">
          Frozen on submit: <ScoreRange cap={cap} />
        </span>
      </div>
      <p className="text-xs text-muted">Your balance may rise or fall as additional independent opinions arrive. Scores reflect agreement with later opinions, not verified accuracy.</p>
    </form>
  );
}
