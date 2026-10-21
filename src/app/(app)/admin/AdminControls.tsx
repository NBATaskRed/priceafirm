"use client";

import { useRef, useState, useTransition } from "react";
import {
  addInviteAction,
  addSourceDomainAction,
  recomputeAllAction,
  removeInviteAction,
  reviewSnapshotAction,
  setSourceStatusAction,
  toggleSourceRightAction,
  type AdminResult,
} from "@/lib/actions/admin";
import { Button, Notice } from "@/components/ui";

function useAdminCall() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  function call(fn: () => Promise<AdminResult>) {
    start(async () => setResult(await fn()));
  }
  return { pending, result, call, clear: () => setResult(null) };
}

function ResultLine({ result }: { result: AdminResult | null }) {
  if (!result) return null;
  return (
    <p role="status" className={`mt-2 text-xs ${result.status === "ok" ? "text-pos" : "text-neg"}`}>
      {result.message}
    </p>
  );
}

export function AddDomainForm() {
  const { pending, result, call } = useAdminCall();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className="mt-3 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        call(() => addSourceDomainAction(fd));
        ref.current?.reset();
      }}
    >
      <label className="block">
        <span className="label">Domain</span>
        <input name="domain" className="input w-56" placeholder="brokersite.com" required />
      </label>
      <label className="block">
        <span className="label">Publisher</span>
        <input name="publisher" className="input w-56" placeholder="Broker name" />
      </label>
      <label className="block">
        <span className="label">Status</span>
        <select name="status" className="input w-36" defaultValue="review">
          <option value="review">Review</option>
          <option value="allowed">Allowed</option>
        </select>
      </label>
      <Button type="submit" disabled={pending} variant="secondary">
        Add domain
      </Button>
      <div className="basis-full">
        <ResultLine result={result} />
      </div>
    </form>
  );
}

export function SourceStatusSelect({ domain, status }: { domain: string; status: "allowed" | "blocked" | "review" }) {
  const { pending, result, call } = useAdminCall();
  return (
    <div>
      <select
        aria-label={`Status for ${domain}`}
        className="input w-28 py-1 text-xs"
        defaultValue={status}
        disabled={pending}
        onChange={(e) => call(() => setSourceStatusAction(domain, e.target.value as "allowed" | "blocked" | "review"))}
      >
        <option value="allowed">allowed</option>
        <option value="review">review</option>
        <option value="blocked">blocked</option>
      </select>
      {result?.status === "error" ? <ResultLine result={result} /> : null}
    </div>
  );
}

export function RightToggle({ domain, flag, value, label }: { domain: string; flag: string; value: boolean; label: string }) {
  const { pending, result, call } = useAdminCall();
  const [checked, setChecked] = useState(value);
  return (
    <div>
      <input
        type="checkbox"
        className="checkbox"
        aria-label={label}
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          call(async () => {
            const r = await toggleSourceRightAction(domain, flag, next);
            if (r.status === "error") setChecked(!next);
            return r;
          });
        }}
      />
      {result?.status === "error" ? <ResultLine result={result} /> : null}
    </div>
  );
}

export function ActionButton({ kind, snapshotId, email }: { kind: "approve" | "withdraw" | "remove_invite"; snapshotId?: string; email?: string }) {
  const { pending, result, call } = useAdminCall();
  const label = kind === "approve" ? "Approve" : kind === "withdraw" ? "Withdraw" : "Remove";
  return (
    <div>
      <Button
        size="sm"
        variant={kind === "approve" ? "primary" : "secondary"}
        disabled={pending}
        onClick={() => {
          if (kind === "remove_invite" && email) {
            if (!window.confirm(`Remove ${email} from invites? Their account will hit the waitlist on next load.`)) return;
            call(() => removeInviteAction(email));
          } else if (snapshotId) {
            if (kind === "withdraw" && !window.confirm("Withdraw this listing? It will not appear in the queue.")) return;
            call(() => reviewSnapshotAction(snapshotId, kind));
          }
        }}
      >
        {pending ? "Working" : label}
      </Button>
      <ResultLine result={result} />
    </div>
  );
}

export function AddInviteForm({ compact = false, email }: { compact?: boolean; email?: string }) {
  const { pending, result, call } = useAdminCall();
  const ref = useRef<HTMLFormElement>(null);
  if (compact && email) {
    return (
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("emails", email);
            fd.set("note", "approved from waitlist");
            call(() => addInviteAction(fd));
          }}
        >
          {pending ? "Inviting" : "Invite"}
        </Button>
        <ResultLine result={result} />
      </div>
    );
  }
  return (
    <form
      ref={ref}
      className="mt-3 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        call(() => addInviteAction(fd));
        ref.current?.reset();
      }}
    >
      <label className="block grow">
        <span className="label">Emails (comma, space or newline separated)</span>
        <textarea name="emails" className="input" rows={2} required placeholder="buyer@firm.com, partner@fund.com" />
      </label>
      <label className="block">
        <span className="label">Note</span>
        <input name="note" className="input w-48" placeholder="cohort 1" />
      </label>
      <Button type="submit" disabled={pending}>
        Add invites
      </Button>
      <div className="basis-full">
        <ResultLine result={result} />
      </div>
    </form>
  );
}

export function RecomputeButton() {
  const { pending, result, call } = useAdminCall();
  return (
    <div className="text-right">
      <Button variant="secondary" disabled={pending} onClick={() => call(() => recomputeAllAction())}>
        {pending ? "Recomputing" : "Recompute all"}
      </Button>
      {result ? (
        <div className="mt-2 max-w-xs">
          <Notice tone={result.status === "ok" ? "success" : "error"}>{result.message}</Notice>
        </div>
      ) : null}
    </div>
  );
}
