"use client";

import { useRouter } from "next/navigation";
import { useId, useRef } from "react";

type Sort = "max" | "fit" | "count";

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "max", label: "Most points" },
  { value: "count", label: "Fewest valuations" },
  { value: "fit", label: "Best fit for me" },
];

function buildQuery(fd: FormData): string {
  const params = new URLSearchParams();
  for (const [k, v] of fd.entries()) {
    const s = String(v).trim();
    if (s && !(k === "sort" && s === "max")) params.set(k, s);
  }
  const qs = params.toString();
  return qs ? `/value?${qs}` : "/value";
}

/** Segmented sort (spec 4.4). Lives in the page header; keeps the current filters. */
export function SortControl({ sort, state, industry, minEarnings }: { sort: Sort; state: string; industry: string; minEarnings: string }) {
  const router = useRouter();
  function go(next: Sort) {
    const fd = new FormData();
    fd.set("sort", next);
    if (state) fd.set("state", state);
    if (industry) fd.set("industry", industry);
    if (minEarnings) fd.set("minEarnings", minEarnings);
    router.replace(buildQuery(fd));
  }
  return (
    <div role="group" aria-label="Sort" className="seg">
      {SORTS.map((s) => (
        <button key={s.value} type="button" className="seg-btn" aria-pressed={sort === s.value} onClick={() => go(s.value)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function ValueFilters({ states, sort, state, industry, minEarnings, hasBuyerProfile }: { states: string[]; sort: Sort; state: string; industry: string; minEarnings: string; hasBuyerProfile: boolean }) {
  const router = useRouter();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(form: HTMLFormElement) {
    router.replace(buildQuery(new FormData(form)));
  }

  return (
    <form
      ref={formRef}
      role="search"
      aria-label="Filter listings"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === "SELECT") submit(e.currentTarget);
      }}
    >
      <input type="hidden" name="sort" value={sort} />
      <div className="min-w-0 flex-[1_1_260px]">
        <label htmlFor={`${id}-industry`} className="label">
          Industry
        </label>
        <input id={`${id}-industry`} name="industry" defaultValue={industry} className="input" placeholder="e.g. HVAC, logistics, software" />
      </div>
      <div className="flex-[0_1_160px]">
        <label htmlFor={`${id}-state`} className="label">
          State
        </label>
        <select id={`${id}-state`} name="state" defaultValue={state} className="input">
          <option value="">Any</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-[0_1_200px]">
        <label htmlFor={`${id}-min`} className="label">
          Earnings at least
        </label>
        <input id={`${id}-min`} name="minEarnings" defaultValue={minEarnings} inputMode="numeric" className="input figures" placeholder="300000" />
      </div>
      <button type="submit" className="btn btn-secondary">
        Apply
      </button>
      {sort === "fit" && !hasBuyerProfile ? <p className="basis-full text-[13px] text-muted">You have no buyer profile yet, so Best fit for me falls back to Most points.</p> : null}
    </form>
  );
}
