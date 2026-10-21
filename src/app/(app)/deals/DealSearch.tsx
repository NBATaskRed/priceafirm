"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { searchDealsAction, type SearchDealsResult } from "@/lib/actions/deals";
import { Button, EmptyState, Notice } from "@/components/ui";

const EXAMPLES = ["HVAC or plumbing in Florida under $4M with SDE over $500K", "B2B services in the Southeast, EBITDA above $1M", "Manufacturing in NC or GA"];

export function DealSearch({ balance }: { balance: number }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<SearchDealsResult | null>(null);
  const [pending, start] = useTransition();

  function run(q: string) {
    setText(q);
    start(async () => {
      setResult(await searchDealsAction(q));
    });
  }

  return (
    <div>
      <form
        className="card card-pad"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) run(text);
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
              if (text.trim()) run(text);
            }
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !text.trim()}>
            {pending ? "Searching" : "Search"}
          </Button>
          <span className="text-xs text-muted">Searching is free and does not affect your eligibility.</span>
        </div>
        {!result ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip hover:border-accent" onClick={() => run(ex)}>
                {ex}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      {result && result.status !== "ok" ? (
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
          <h2 className="text-lg font-semibold">
            <span className="figures">{result.count}</span> {result.count === 1 ? "opportunity matches" : "opportunities match"}
            {result.count > result.slots.length ? <span className="text-sm font-normal text-muted"> (showing the top {result.slots.length})</span> : null}
          </h2>

          <Notice tone="warn" className="mt-3">
            Previewing an opportunity makes you ineligible for points from valuing that business. Your points won&apos;t change.
          </Notice>

          {result.slots.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="Nothing matches yet">
                Try fewer constraints, or{" "}
                <Link href="/add" className="underline">
                  add a listing
                </Link>{" "}
                you have found elsewhere.
              </EmptyState>
            </div>
          ) : (
            <ol className="mt-4 space-y-2">
              {result.slots.map((slot, i) => (
                <li key={slot.token} className="slot">
                  <div className="flex items-center gap-3">
                    <span className="slot-mark figures text-sm" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{slot.label}</p>
                      <p className="text-xs text-muted">Ranked by the crowd&apos;s view. Details hidden until you preview.</p>
                    </div>
                  </div>
                  <Link href={`/deals/${encodeURIComponent(slot.token)}`} className="btn btn-secondary btn-sm">
                    Preview free
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs text-muted">
            Results expire after 30 minutes. Revealing an original listing URL after a preview costs 1 point; your balance is <span className="figures text-text">{balance.toFixed(1)}</span>.
          </p>
        </section>
      ) : null}
    </div>
  );
}
