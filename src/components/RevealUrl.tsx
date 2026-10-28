"use client";

import { useState, useTransition } from "react";
import { revealUrlAction, type RevealUrlResult } from "@/lib/actions/deals";
import { revealCost } from "@/lib/domain/types";
import { Button, Notice } from "./ui";

/**
 * "See the broker listing" (spec 4.3 / 4.5): free while the listing has fewer than 3 independent
 * valuations (the buyer's own counts), 1 point from 3 on; once per business; re-opens free; free if
 * self-submitted. Charging happens only in the reveal_url RPC.
 *
 * layout "stack": full-width primary with the price in the label (locked-in page).
 * layout "row": button with a short note under it (Find deals rows).
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
  layout = "stack",
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
  /** @deprecated sizing follows layout. */
  size?: "sm" | "md";
  layout?: "stack" | "row";
}) {
  const [result, setResult] = useState<RevealUrlResult | null>(initialUrl ? { status: "already_unlocked", url: initialUrl, charged: Boolean(initialCharged), balance } : null);
  const [pending, start] = useTransition();

  const revealed = result && "url" in result;
  const cost = alreadyUnlocked || selfSubmitted ? 0 : revealCost(nInd);
  const cannotAfford = cost === 1 && balance < 1;
  const row = layout === "row";
  const wrap = row ? "flex flex-col items-stretch gap-1.5 sm:items-end" : "flex flex-col gap-2";
  const noteId = `reveal-note-${businessId}`;

  if (revealed) {
    const host = (() => {
      try {
        return new URL(result.url).hostname.replace(/^www\./, "");
      } catch {
        return result.url;
      }
    })();
    return (
      <div className={wrap}>
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={`btn btn-secondary ${row ? "" : "btn-lg w-full"}`}
          aria-describedby={noteId}
        >
          Open broker listing
        </a>
        <p id={noteId} className={`text-[13px] text-muted ${row ? "sm:text-right" : "text-center"}`}>
          Yours to reopen any time
          {result.status === "charged" ? " · 1 point used" : ""} · <span className="break-all">{host}</span>
        </p>
        {attributionText || publisher ? <p className={`text-xs text-muted ${row ? "sm:text-right" : "text-center"}`}>{attributionText ?? `Listing published by ${publisher}.`}</p> : null}
      </div>
    );
  }

  const label = alreadyUnlocked ? "Open broker listing" : row ? "See the broker listing" : `See the broker listing (${cost === 0 ? "free" : "1 point"})`;
  const note = alreadyUnlocked
    ? "Yours to reopen any time"
    : selfSubmitted
      ? "Free, you added this listing"
      : cost === 0
        ? "Free, fewer than 3 valuations"
        : cannotAfford
          ? row
            ? "Needs 1 point"
            : `Needs 1 point. You have ${balance.toFixed(1).replace("-", "−")}.`
          : "1 point";

  return (
    <div className={wrap}>
      <Button
        variant={alreadyUnlocked ? "secondary" : "primary"}
        size={row ? "md" : "lg"}
        className={row ? "" : "w-full"}
        disabled={pending || cannotAfford}
        aria-describedby={noteId}
        onClick={() =>
          start(async () => {
            setResult(await revealUrlAction(businessId));
          })
        }
      >
        {pending ? "Opening" : label}
      </Button>
      <p id={noteId} className={`text-[13px] text-muted ${row ? "sm:text-right" : "text-center"} ${!row && !cannotAfford && !selfSubmitted && !alreadyUnlocked ? "sr-only" : ""}`}>
        {note}
      </p>
      {result && !revealed ? (
        <Notice tone="error" className="mt-1">
          {result.message}
        </Notice>
      ) : null}
    </div>
  );
}
