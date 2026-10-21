"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { confirmDealsGateAction, searchDealsAction, type DealRow, type SearchDealsResult } from "@/lib/actions/deals";
import { EARNINGS_LABEL } from "@/lib/domain/types";
import { Button, Card, EVIDENCE_TEXT, EmptyState, MODEL_DERIVED, Money, Notice, fmtDate } from "@/components/ui";
import { RevealUrl } from "@/components/RevealUrl";

const EXAMPLES = ["HVAC or plumbing in Florida under $4M with SDE over $500K", "B2B services in the Southeast, EBITDA above $1M", "Manufacturing in NC or GA"];

export function DealSearch({ balance, gateConfirmed: initialGate }: { balance: number; gateConfirmed: boolean }) {
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
      <Card>
        <h2 className="text-xl">Before you search</h2>
        <p className="mt-3 text-[15px]">
          Listings here include crowd valuations. Any listing you see here can no longer earn you points. If you want to value a listing first, use Value
          Businesses.
        </p>
        <p className="mt-2 text-sm text-muted">Searching is free and never changes your balance. This notice appears once per session.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                await confirmDealsGateAction();
                setGate(true);
              })
            }
          >
            I understand, show me deals
          </Button>
          <Link href="/value" className="btn btn-secondary">
            Value businesses first
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <form
        className="card card-pad"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) run(text, 1);
        }}
      >
        <label htmlFor="deal-query" className="label">
          What are you looking for?
        </label>
        <textarea
          id="deal-query"
          className="input text-base"
          rows={2}
          maxLength={400}
          placeholder="e.g. HVAC or plumbing in Florida under $4M with SDE over $500K"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) run(text, 1);
            }
          }}
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Button type="submit" disabled={pending || !text.trim()}>
            {pending ? "Searching" : "Search"}
          </Button>
          <label className="block">
            <span className="label">Min valuations</span>
            <select
              className="input w-36 py-1.5"
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
          </label>
          <span className="pb-2 text-xs text-muted">Every listing shown here ends your eligibility to earn points on it.</span>
        </div>
        {!result ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip hover:border-accent" onClick={() => run(ex, 1)}>
                {ex}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      {result && result.status === "gate_required" ? (
        <Notice tone="warn" className="mt-4">
          {result.message}{" "}
          <button type="button" className="underline" onClick={() => setGate(false)}>
            Show the notice
          </button>
        </Notice>
      ) : null}
      {result && (result.status === "rate_limited" || result.status === "invalid") ? (
        <Notice tone="error" className="mt-4">
          {result.message}
        </Notice>
      ) : null}

      {result && result.status === "ok" ? (
        <section className="mt-6" aria-live="polite">
          {result.chips.length ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Interpreted as</span>
              {result.chips.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              <span className="figures">{result.count}</span> {result.count === 1 ? "listing matches" : "listings match"}
            </h2>
            <span className="text-xs text-muted">{MODEL_DERIVED}</span>
          </div>

          {result.rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="Nothing matches yet">
                Try fewer constraints or a lower minimum valuation count, or{" "}
                <Link href="/add" className="underline">
                  add a listing
                </Link>{" "}
                you have found elsewhere.
              </EmptyState>
            </div>
          ) : (
            <ol className="mt-4 space-y-3">
              {result.rows.map((row) => (
                <DealRowCard key={row.snapshotId} row={row} balance={result.balance} />
              ))}
            </ol>
          )}

          {result.pages > 1 ? (
            <nav aria-label="Pages" className="mt-5 flex items-center justify-between text-sm">
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

function DealRowCard({ row, balance }: { row: DealRow; balance: number }) {
  return (
    <li className="card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-snug">{row.headline}</h3>
          <p className="text-sm text-muted">
            {row.industry} · {row.location} · snapshot <span className="figures">{fmtDate(row.snapshotDate)}</span>
          </p>
        </div>
        <span className="chip">{row.nInd > 0 ? `Based on ${row.nInd} independent ${row.nInd === 1 ? "valuation" : "valuations"}` : "No independent valuations yet"}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div>
          <dt className="text-xs text-muted">Ask</dt>
          <dd className="figures">{row.askingPrice != null ? <Money value={row.askingPrice} /> : <span className="text-muted">Not shown</span>}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Revenue</dt>
          <dd className="figures">
            <Money value={row.revenue} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{row.earningsType === "unknown" ? "Earnings" : EARNINGS_LABEL[row.earningsType]}</dt>
          <dd className="figures">
            <Money value={row.earnings} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Crowd median EV</dt>
          <dd className="figures">
            {row.medianEv != null ? (
              <>
                <Money value={row.medianEv} />
                {row.medianToAsk != null ? <span className="text-muted"> · {row.medianToAsk.toFixed(2)}× ask</span> : null}
              </>
            ) : (
              <span className="text-muted">n/a</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Pr(EV above ask)</dt>
          <dd className="figures">{row.prAboveAsk != null ? `${Math.round(row.prAboveAsk * 100)}%` : <span className="text-muted">n/a</span>}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">
        {EVIDENCE_TEXT[row.evidence]}
        {row.nInd > 0 ? ". Model-derived, not an offer or observed price." : ". Ranked by fit to your buyer profile."}
      </p>

      <div className="border-t border-border pt-1">
        <RevealUrl
          businessId={row.businessId}
          nInd={row.nInd}
          mayLink={row.mayLink}
          alreadyUnlocked={row.alreadyUnlocked}
          selfSubmitted={row.selfSubmitted}
          balance={balance}
          publisher={row.publisher}
          attributionRequired={row.attributionRequired}
          size="sm"
        />
      </div>
    </li>
  );
}
