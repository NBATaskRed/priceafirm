"use client";

import { useState, useTransition } from "react";
import { revealUrlAction, type RevealUrlResult } from "@/lib/actions/deals";
import { revealCost } from "@/lib/domain/types";
import { Button, Notice } from "./ui";

function valuationsWord(n: number) {
  return `${n} ${n === 1 ? "valuation" : "valuations"}`;
}

/**
 * Reveal the source URL (design v2.2): free while the listing has fewer than 3 independent
 * valuations, 1 point from 3 on; once per business; re-opens free; free if self-submitted.
 */
export function RevealUrl({
  businessId,
  nInd,
  alreadyUnlocked,
  selfSubmitted = false,
  balance,
  publisher,
  attributionText = null,
  initialUrl = null,
  initialCharged = null,
  size = "md",
}: {
  businessId: string;
  nInd: number;
  alreadyUnlocked: boolean;
  selfSubmitted?: boolean;
  balance: number;
  publisher: string | null;
  attributionText?: string | null;
  initialUrl?: string | null;
  initialCharged?: boolean | null;
  size?: "sm" | "md";
}) {
  const [result, setResult] = useState<RevealUrlResult | null>(initialUrl ? { status: "already_unlocked", url: initialUrl, charged: Boolean(initialCharged), balance } : null);
  const [pending, start] = useTransition();

  const revealed = result && "url" in result;
  const cost = revealCost(nInd);
  const cannotAfford = !alreadyUnlocked && !selfSubmitted && cost === 1 && balance < 1;

  if (revealed) {
    const host = (() => {
      try {
        return new URL(result.url).hostname.replace(/^www\./, "");
      } catch {
        return result.url;
      }
    })();
    return (
      <div className="mt-3">
        <a href={result.url} target="_blank" rel="noopener noreferrer nofollow" className={`btn btn-primary ${size === "sm" ? "btn-sm" : ""}`}>
          Open listing on {host}
        </a>
        <p className="mt-2 break-all text-sm text-muted">{result.url}</p>
        <p className="mt-2 text-sm">
          {result.status === "charged" ? (
            <>
              Charged 1 point · Balance <span className="figures">{result.balance.toFixed(1)}</span>
            </>
          ) : result.status === "free" ? (
            <>Free reveal: fewer than 3 independent valuations on file. No charge.</>
          ) : result.status === "self_submitted" ? (
            <>You submitted this listing, so there is no charge.</>
          ) : (
            <>Already unlocked, no charge.</>
          )}
        </p>
        {attributionText || publisher ? <p className="mt-1 text-xs text-muted">{attributionText ?? `Listing published by ${publisher}.`}</p> : null}
      </div>
    );
  }

  const label = alreadyUnlocked
    ? "Open source URL"
    : selfSubmitted
      ? "Reveal source URL — free (you submitted it)"
      : cost === 0
        ? `Reveal source URL — free (${valuationsWord(nInd)})`
        : `Reveal source URL — 1 point (${valuationsWord(nInd)})`;

  return (
    <div className="mt-3">
      <Button
        size={size}
        disabled={pending || cannotAfford}
        aria-describedby={`reveal-hint-${businessId}`}
        onClick={() =>
          start(async () => {
            setResult(await revealUrlAction(businessId));
          })
        }
      >
        {pending ? "Revealing" : label}
      </Button>
      <p id={`reveal-hint-${businessId}`} className="mt-2 text-xs text-muted">
        {alreadyUnlocked
          ? "You already unlocked this business. Re-opening is free."
          : selfSubmitted
            ? "You added this listing, so revealing it costs nothing."
            : cost === 0
              ? "Reveals are free until a listing has 3 independent valuations, then cost 1 point once per business."
              : cannotAfford
                ? `Your balance is ${balance.toFixed(1)}, below the 1 point needed. Value a business to earn more, then come back.`
                : `Costs 1 point once per business because this listing has ${valuationsWord(nInd)}. Re-opens are free. Your balance is ${balance.toFixed(1)}.`}
      </p>
      {result && !revealed ? (
        <Notice tone="error" className="mt-3">
          {result.message}
        </Notice>
      ) : null}
    </div>
  );
}
