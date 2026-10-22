"use client";

import { useRef, useState, useTransition } from "react";
import {
  addInviteAction,
  addSourceDomainAction,
  recomputeAllAction,
  recordComplaintAction,
  removeInviteAction,
  removeSourceAction,
  restoreSourceAction,
  reviewSnapshotAction,
  setSourceTypeAction,
  updateSourceAction,
  voidForecastAction,
  issueInviteAction,
  resendInviteAction,
  revokeInviteAction,
  updateSnapshotFactsAction,
  type AdminResult,
} from "@/lib/actions/admin";
import type { SourceDomain } from "@/lib/domain/types";
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
        <input name="domain" className="input w-52" placeholder="brokersite.com" required />
      </label>
      <label className="block">
        <span className="label">Type</span>
        <select name="source_type" className="input w-40" defaultValue="third_party">
          <option value="third_party">Third party</option>
          <option value="operator">Operator</option>
          <option value="excluded">Excluded</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Publisher</span>
        <input name="publisher" className="input w-48" placeholder="Broker name" />
      </label>
      <label className="block grow">
        <span className="label">Attribution text (shown with revealed URLs)</span>
        <input name="attribution_text" className="input" placeholder="Listing courtesy of ..." />
      </label>
      <Button type="submit" disabled={pending} variant="secondary">
        Record domain
      </Button>
      <div className="basis-full">
        <ResultLine result={result} />
      </div>
    </form>
  );
}

export function SourceRow({ source, firstSeen }: { source: SourceDomain; firstSeen: string }) {
  const { pending, result, call } = useAdminCall();
  const [editing, setEditing] = useState(false);
  const removed = Boolean(source.removed_at);
  return (
    <>
      <tr className={removed ? "opacity-70" : ""}>
        <td className="font-medium">{source.domain}</td>
        <td>
          <select
            aria-label={`Source type for ${source.domain}`}
            className="input w-32 py-1 text-xs"
            defaultValue={source.source_type}
            disabled={pending}
            onChange={(e) => call(() => setSourceTypeAction(source.domain, e.target.value))}
          >
            <option value="operator">operator</option>
            <option value="third_party">third party</option>
            <option value="excluded">excluded</option>
          </select>
        </td>
        <td className="max-w-xs text-muted">
          {source.publisher ?? <span className="italic">none</span>}
          {source.attribution_text ? <span className="block text-xs">{source.attribution_text}</span> : null}
          {source.notes ? <span className="block text-xs">{source.notes}</span> : null}
          <button type="button" className="mt-1 text-xs underline hover:text-text" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit"}
          </button>
        </td>
        <td className="figures text-muted">{firstSeen}</td>
        <td className="text-muted">
          {source.complaint_received_at ? (
            <span className="figures">{source.complaint_received_at.slice(0, 10)}</span>
          ) : (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => call(() => recordComplaintAction(source.domain))}>
              Record complaint
            </Button>
          )}
        </td>
        <td className="text-muted">
          {removed ? (
            <>
              <span className="figures">{source.removed_at!.slice(0, 10)}</span>
              {source.removal_reason ? <span className="block max-w-[14rem] text-xs">{source.removal_reason}</span> : null}
            </>
          ) : (
            "live"
          )}
        </td>
        <td>
          {removed ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Restore ${source.domain}? Its listings become visible again.`)) call(() => restoreSourceAction(source.domain));
              }}
            >
              Restore
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                const reason = window.prompt(`Remove ${source.domain} on complaint. Reason (who, when):`);
                if (reason && reason.trim()) call(() => removeSourceAction(source.domain, reason.trim()));
              }}
            >
              Remove on complaint
            </Button>
          )}
          <ResultLine result={result} />
        </td>
      </tr>
      {editing ? (
        <tr>
          <td colSpan={7}>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set("domain", source.domain);
                call(async () => {
                  const r = await updateSourceAction(fd);
                  if (r.status === "ok") setEditing(false);
                  return r;
                });
              }}
            >
              <label className="block">
                <span className="label">Publisher</span>
                <input name="publisher" className="input w-48" defaultValue={source.publisher ?? ""} />
              </label>
              <label className="block grow">
                <span className="label">Attribution text</span>
                <input name="attribution_text" className="input" defaultValue={source.attribution_text ?? ""} />
              </label>
              <label className="block grow">
                <span className="label">Notes</span>
                <input name="notes" className="input" defaultValue={source.notes ?? ""} />
              </label>
              <Button type="submit" size="sm" disabled={pending}>
                Save
              </Button>
            </form>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function VoidForecastButton({ forecastId }: { forecastId: string }) {
  const { pending, result, call } = useAdminCall();
  return (
    <div>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt("Void this forecast. Reason (fraud, duplicate account, NDA breach...):");
          if (reason && reason.trim()) call(() => voidForecastAction(forecastId, reason.trim()));
        }}
      >
        {pending ? "Voiding" : "Void forecast"}
      </Button>
      <ResultLine result={result} />
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
          } else if (snapshotId && kind !== "remove_invite") {
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


export function IssueInviteForm() {
  const { pending, result, call } = useAdminCall();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className="mt-3 grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        call(() => issueInviteAction(fd));
      }}
    >
      <label className="block">
        <span className="label">Buyer name</span>
        <input name="buyer_name" className="input" required />
      </label>
      <label className="block">
        <span className="label">Buyer email</span>
        <input name="buyer_email" type="email" className="input" required />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Listing URL</span>
        <input name="listing_url" type="url" className="input" required placeholder="https://www.synergybb.com/listings/..." />
      </label>
      <label className="block">
        <span className="label">Buyer has</span>
        <select name="information_level" className="input" defaultValue="cim">
          <option value="cim">CIM / materials (after NDA)</option>
          <option value="listing">Public listing only</option>
        </select>
      </label>
      <label className="flex items-center gap-2 self-end text-sm">
        <input type="checkbox" name="resend" /> Resend if an open invite exists
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending" : "Send valuation request"}
        </Button>
        <ResultLine result={result} />
      </div>
    </form>
  );
}

export function InviteRowActions({ inviteId, canResend }: { inviteId: string; canResend: boolean }) {
  const { pending, result, call } = useAdminCall();
  return (
    <div className="flex flex-wrap gap-2">
      {canResend ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => call(() => resendInviteAction(inviteId))}>
          Resend
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => call(() => revokeInviteAction(inviteId))}>
        Revoke link
      </Button>
      <ResultLine result={result} />
    </div>
  );
}

export function EditFactsForm({
  snapshotId,
  initial,
}: {
  snapshotId: string;
  initial: { headline: string; industry: string; industry_tags: string[]; state: string | null; metro: string | null; asking_price: number | null; revenue: number | null; earnings: number | null; earnings_type: string };
}) {
  const { pending, result, call } = useAdminCall();
  const field = (name: string, label: string, value: string | number | null, extra = "") => (
    <label className={`block ${extra}`}>
      <span className="label">{label}</span>
      <input name={name} className="input" defaultValue={value ?? ""} />
    </label>
  );
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-muted hover:text-text">Edit facts</summary>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          call(() => updateSnapshotFactsAction(snapshotId, fd));
        }}
      >
        {field("headline", "Headline (neutral, no names)", initial.headline, "sm:col-span-2")}
        {field("industry", "Industry", initial.industry, "sm:col-span-2")}
        {field("industry_tags", "Tags (comma separated)", initial.industry_tags.join(", "), "sm:col-span-2")}
        {field("state", "State (2 letters)", initial.state)}
        {field("metro", "Metro", initial.metro)}
        {field("asking_price", "Ask (EV, $)", initial.asking_price)}
        {field("revenue", "Revenue ($)", initial.revenue)}
        {field("earnings", "Earnings ($)", initial.earnings)}
        <label className="block">
          <span className="label">Earnings type</span>
          <select name="earnings_type" className="input" defaultValue={initial.earnings_type}>
            <option value="sde">SDE</option>
            <option value="ebitda">EBITDA</option>
            <option value="seller_cash_flow">Seller cash flow</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <div className="sm:col-span-4">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving" : "Save facts"}
          </Button>
          <ResultLine result={result} />
        </div>
      </form>
    </details>
  );
}
