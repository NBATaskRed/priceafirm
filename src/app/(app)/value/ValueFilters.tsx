"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";

export function ValueFilters({ states, sort, state, industry, minEarnings, hasBuyerProfile }: { states: string[]; sort: "max" | "fit" | "count"; state: string; industry: string; minEarnings: string; hasBuyerProfile: boolean }) {
  const router = useRouter();
  const id = useId();

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      const s = String(v).trim();
      if (s && !(k === "sort" && s === "max")) params.set(k, s);
    }
    const qs = params.toString();
    router.replace(qs ? `/value?${qs}` : "/value");
  }

  return (
    <form
      className="mb-6 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === "SELECT") submit(e.currentTarget);
      }}
    >
      <div>
        <label htmlFor={`${id}-sort`} className="label">
          Sort
        </label>
        <select id={`${id}-sort`} name="sort" defaultValue={sort} className="input w-44">
          <option value="max">Largest possible score</option>
          <option value="count">Fewest valuations first</option>
          <option value="fit">Fit to my buyer profile</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-state`} className="label">
          State
        </label>
        <select id={`${id}-state`} name="state" defaultValue={state} className="input w-28">
          <option value="">Any</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-industry`} className="label">
          Industry contains
        </label>
        <input id={`${id}-industry`} name="industry" defaultValue={industry} className="input w-44" placeholder="e.g. services" />
      </div>
      <div>
        <label htmlFor={`${id}-min`} className="label">
          Earnings at least
        </label>
        <input id={`${id}-min`} name="minEarnings" defaultValue={minEarnings} inputMode="numeric" className="input w-36 figures" placeholder="500000" />
      </div>
      <button type="submit" className="btn btn-secondary">
        Apply
      </button>
      {sort === "fit" && !hasBuyerProfile ? <p className="basis-full text-xs text-muted">You have no buyer profile yet, so fit sorting falls back to largest possible score.</p> : null}
    </form>
  );
}
