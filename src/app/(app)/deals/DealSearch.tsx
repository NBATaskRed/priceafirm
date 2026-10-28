"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { confirmDealsGateAction, searchDealsAction, type DealRow, type SearchDealsResult } from "@/lib/actions/deals";
import { fmtMoney } from "@/lib/domain/types";
import { Button, EmptyState, MODEL_DERIVED, Notice, basedOnText, earningsLabel, fmtShort } from "@/components/ui";
import { RatioFigure } from "@/components/CrowdStats";
import { RevealUrl } from "@/components/RevealUrl";

const EXAMPLES = ["HVAC or plumbing in Florida under $4M with SDE over $500K", "B2B services in the Southeast, EBITDA above $1M", "Manufacturing in NC or GA"];

export function DealSearch({ gateConfirmed: initialGate }: { gateConfirmed: boolean }) {
  const [gate, setGate] = useState(initialGate);
  const [text, setText] = useState("");
  const [minValuations, setMinValuations] = useState(0);
  const [result, setResult] = useState<SearchDealsResult | null>(null);
  const [pending, start] = useTransition();

  function run(q: string, page = 1, minV = minValuations) {
    setText(q);
    start(async () => {
      setResult(await searchDealsAction(q, page, minV));
    });
  }

  if (!gate) {
    return (
      <section className="mx-auto flex max-w-[640px] flex-col gap-5 py-10 md:py-20" aria-labelledby="gate-title">
        <h1 id="gate-title" className="text-[28px] font-bold leading-[1.15] tracking-[-0.02em] md:text-[36px]">
          Before you look
        </h1>
        <p className="text-[17px] leading-[1.55] text-text-soft md:text-[18px]">
          Listings here show what other buyers think they&apos;re worth. Once you&apos;ve seen a listing here, valuing it can&apos;t earn you points.
        </p>
        <p className="text-base leading-[1.55] text-muted">Want points and the deal? Value it first in Value businesses. You&apos;ll see the buyers&apos; view right after.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Button
            size="lg"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await confirmDealsGateAction();
                setGate(true);
              })
            }
          >
            Show me deals
          </Button>
          <Link href="/value" className="btn btn-secondary btn-lg">
            Value businesses first
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <h1 className="text-[26px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[40px]">Find deals</h1>
      <form
        role="search"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) run(text, 1);
        }}
      >
        <label htmlFor="deal-query" className="text-[15px] text-muted">
          Describe what you&apos;re looking for
        </label>
        <div className="flex flex-wrap gap-2.5">
          <input
            id="deal-query"
            className="input input-lg min-w-0 flex-[1_1_420px]"
            maxLength={400}
            autoComplete="off"
            placeholder="e.g. B2B services in Georgia or Florida, SDE at least $300K, under $5M"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" variant="invert" size="lg" disabled={pending || !text.trim()}>
            {pending ? "Searching" : "Search"}
          </Button>
        </div>
        {result?.status === "ok" && result.chips.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">We read that as</span>
            {result.chips.map((c) => (
              <span key={c} className="chip">
                {c}
              </span>
            ))}
          </div>
        ) : null}
        {!result ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">Try</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip hover:border-text" onClick={() => run(ex, 1)}>
                {ex}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <label htmlFor="deal-minv" className="text-[13px] text-muted">
            Valuations at least
          </label>
          <select
            id="deal-minv"
            className="input w-36"
            value={minValuations}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMinValuations(v);
              if (result?.status === "ok" && text.trim()) run(text, 1, v);
            }}
          >
            <option value={0}>Any</option>
            <option value={1}>1 or more</option>
            <option value={3}>3 or more</option>
            <option value={5}>5 or more</option>
            <option value={10}>10 or more</option>
          </select>
        </div>
      </form>

      {result && result.status === "gate_required" ? (
        <Notice tone="warn">
          {result.message}{" "}
          <button type="button" className="underline" onClick={() => setGate(false)}>
            Show the note
          </button>
        </Notice>
      ) : null}
      {result && (result.status === "rate_limited" || result.status === "invalid") ? <Notice tone="error">{result.message}</Notice> : null}

      {result && result.status === "ok" ? (
        <section className="flex flex-col gap-[22px]" aria-live="polite" aria-label="Results">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-base text-text-soft">
              <span className="figures">{result.count}</span> {result.count === 1 ? "match" : "matches"}, best value for the price first
            </p>
            <p className="text-sm text-muted">{MODEL_DERIVED.replace(/\.$/, "")}</p>
          </div>

          {result.rows.length === 0 ? (
            <EmptyState title="Nothing matches yet">
              Try fewer constraints or a lower valuation count, or{" "}
              <Link href="/add" className="underline">
                add a listing
              </Link>{" "}
              you found elsewhere.
            </EmptyState>
          ) : (
            <ol className="flex flex-col gap-3">
              {result.rows.map((row) => (
                <DealRowCard key={row.snapshotId} row={row} balance={result.balance} />
              ))}
            </ol>
          )}

          {result.pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center justify-between text-sm">
              <Button variant="secondary" size="sm" disabled={pending || result.page <= 1} onClick={() => run(text, result.page - 1)}>
                Previous
              </Button>
              <span className="figures text-muted">
                Page {result.page} of {result.pages}
              </span>
              <Button variant="secondary" size="sm" disabled={pending || result.page >= result.pages} onClick={() => run(text, result.page + 1)}>
                Next
              </Button>
            </nav>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function place(row: DealRow): string {
  const parts = row.location.split(" · ");
  // location is region · state · metro; show "metro, ST" like other screens.
  const metro = parts.length >= 3 ? parts[parts.length - 1] : null;
  return metro && row.state ? `${metro}, ${row.state}` : row.location;
}

function DealRowCard({ row, balance }: { row: DealRow; balance: number }) {
  const facts = [
    `Ask ${fmtMoney(row.askingPrice, { compact: true })}`,
    `Revenue ${fmtMoney(row.revenue, { compact: true })}`,
    `${earningsLabel(row.earningsType)} ${fmtMoney(row.earnings, { compact: true })}`,
  ];
  return (
    <li className="card flex flex-wrap items-center gap-x-9 gap-y-[18px] px-[22px] py-5">
      <div className="min-w-0 flex-[1_1_240px]">
        <h2 className="text-[19px] font-bold leading-snug">{row.headline}</h2>
        <p className="mt-1 text-sm text-muted">
          {place(row)} · {row.industry}
        </p>
        <p className="figures mt-2.5 flex flex-wrap gap-x-4 text-sm text-text-soft">
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </p>
      </div>

      {row.nInd > 0 ? (
        <div className="flex flex-[1_1_300px] flex-col gap-2">
          {row.medianToAsk != null ? (
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <RatioFigure ratio={row.medianToAsk} className="text-[32px] font-extrabold leading-tight" />
              <span className="text-sm text-muted">buyers&apos; value vs. asking price</span>
            </div>
          ) : row.medianEv != null ? (
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="figures text-[32px] font-extrabold leading-tight">{fmtShort(row.medianEv)}</span>
              <span className="text-sm text-muted">buyers&apos; median value</span>
            </div>
          ) : null}
          {row.prAboveAsk != null ? (
            <div className="flex items-center gap-2.5">
              <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-track">
                <div className="h-1.5 rounded-[3px] bg-text" style={{ width: `${Math.round(row.prAboveAsk * 100)}%` }} />
              </div>
              <span className="whitespace-nowrap text-sm text-text-soft">
                <span className="figures">{Math.round(row.prAboveAsk * 100)}%</span> chance it is worth more than ask
              </span>
            </div>
          ) : null}
          <span className="text-[13px] text-muted">{basedOnText(row.nInd)}</span>
        </div>
      ) : (
        <p className="flex-[1_1_300px] text-[15px] text-muted">No independent valuations yet. Value it first and you&apos;ll see the buyers&apos; view as it forms.</p>
      )}

      <div className="flex-[0_0_auto] max-sm:w-full">
        <RevealUrl
          businessId={row.businessId}
          nInd={row.nInd}
          alreadyUnlocked={row.alreadyUnlocked}
          selfSubmitted={row.selfSubmitted}
          balance={balance}
          publisher={row.publisher}
          attributionText={row.attributionText}
          layout="row"
        />
      </div>
    </li>
  );
}
