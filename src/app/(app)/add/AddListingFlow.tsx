"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Confidence } from "@/lib/domain/types";
import { requestSourceReviewAction, submitListingAction, validateUrlAction, type SubmitListingResult, type ValidateUrlResult } from "@/lib/actions/listing";
import { Button, ButtonLink, Card, FactsGrid, Notice, PointsRange } from "@/components/ui";
import { ValuationForm } from "@/components/ValuationForm";
import { ConfidencePicker } from "@/components/ConfidencePicker";
import { MoneyInput } from "@/components/MoneyInput";
import { TermsCheckbox } from "@/components/TermsCheckbox";

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export function AddListingFlow({ needsTerms }: { needsTerms: boolean }) {
  const [url, setUrl] = useState("");
  const [validation, setValidation] = useState<ValidateUrlResult | null>(null);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function check() {
    const raw = url.trim();
    if (!raw) return;
    setReviewMsg(null);
    start(async () => {
      setValidation(await validateUrlAction(raw));
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          <label htmlFor="listing-url" className="label">
            Listing URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="listing-url"
              className="input"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://brokersite.com/listing/123456"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (validation) setValidation(null);
              }}
              required
            />
            <Button type="submit" disabled={pending || !url.trim()} className="sm:w-40">
              {pending && !validation ? "Checking" : "Check URL"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">Blocked sources are rejected before anything is fetched. Tracking parameters are stripped automatically.</p>
        </form>
      </Card>

      {validation?.status === "blocked" ? (
        <Notice tone="error" title="This source is excluded for the pilot. Nothing was fetched.">
          {validation.message} ({validation.domain})
        </Notice>
      ) : null}

      {validation?.status === "invalid" ? <Notice tone="error">{validation.message}</Notice> : null}

      {validation?.status === "unknown_source" ? (
        <Card>
          <p className="font-semibold">{validation.domain} has not been cleared yet</p>
          <p className="mt-1 text-sm text-muted">{validation.message} We fetch nothing from a source until its rights are reviewed.</p>
          {reviewMsg ? (
            <Notice tone="success" className="mt-3">
              {reviewMsg}
            </Notice>
          ) : (
            <Button
              variant="secondary"
              className="mt-3"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await requestSourceReviewAction(url);
                  setReviewMsg(r.message);
                })
              }
            >
              Submit for rights review
            </Button>
          )}
        </Card>
      ) : null}

      {validation?.status === "existing" ? <ExistingListing v={validation} needsTerms={needsTerms} /> : null}

      {validation?.status === "new" ? <NewListingForm key={validation.url} v={validation} needsTerms={needsTerms} /> : null}
    </div>
  );
}

function ExistingListing({ v, needsTerms }: { v: Extract<ValidateUrlResult, { status: "existing" }>; needsTerms: boolean }) {
  return (
    <Card>
      <p className="text-sm text-muted">Already on PriceAFirm</p>
      <h2 className="text-xl font-semibold">{v.snapshot.headline}</h2>
      <div className="mt-4">
        <FactsGrid snapshot={v.snapshot} />
      </div>
      <div className="mt-5 border-t border-border pt-4">
        {v.exposed ? (
          <Notice tone="warn" title="You previewed this deal, so a scored valuation isn't available">
            You can still find it under Find deals or My unlocked listings.
          </Notice>
        ) : v.alreadyValued ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>You already valued this business.</span>
            <ButtonLink href={`/value/${v.snapshotId}/done`} variant="secondary" size="sm">
              See your valuation
            </ButtonLink>
          </div>
        ) : v.contractToken && v.bounds ? (
          <div>
            <h3 className="text-lg font-semibold">What do you think this business is worth?</h3>
            <p className="mb-4 mt-1 text-sm text-muted">
              {v.nCount === 0 ? "No valuations yet." : `${v.nCount} independent ${v.nCount === 1 ? "valuation" : "valuations"} so far.`} Submitting the URL again earns nothing; a valuation can.
            </p>
            <ValuationForm snapshotId={v.snapshotId} contractToken={v.contractToken} bounds={v.bounds} needsTerms={needsTerms} compact />
          </div>
        ) : (
          <p className="text-sm text-muted">{v.message}</p>
        )}
      </div>
    </Card>
  );
}

function NewListingForm({ v, needsTerms }: { v: Extract<ValidateUrlResult, { status: "new" }>; needsTerms: boolean }) {
  const f = v.facts;
  const [headline, setHeadline] = useState(f.industry ? `${f.industry}` : "");
  const [industry, setIndustry] = useState(f.industry ?? "");
  const [tags, setTags] = useState("");
  const [state, setState] = useState(f.state ?? "");
  const [metro, setMetro] = useState(f.metro ?? "");
  const [ask, setAsk] = useState(f.askingPrice ? String(Math.round(f.askingPrice)) : "");
  const [revenue, setRevenue] = useState(f.revenue ? String(Math.round(f.revenue)) : "");
  const [revenuePeriod, setRevenuePeriod] = useState("TTM");
  const [earnings, setEarnings] = useState(f.earnings ? String(Math.round(f.earnings)) : "");
  const [earningsType, setEarningsType] = useState<"sde" | "ebitda" | "seller_cash_flow" | "unknown">(f.earningsType ?? "unknown");
  const [inv, setInv] = useState(f.includesInventory == null ? "" : f.includesInventory ? "yes" : "no");
  const [nwc, setNwc] = useState("");
  const [re, setRe] = useState(f.includesRealEstate == null ? "" : f.includesRealEstate ? "yes" : "no");
  const [note, setNote] = useState("");

  const [value, setValue] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [rationale, setRationale] = useState("");
  const [terms, setTerms] = useState(false);

  const [pending, start] = useTransition();
  const [result, setResult] = useState<SubmitListingResult | null>(null);

  const valueDigits = value.replace(/[^0-9]/g, "");
  const valuationReady = valueDigits.length > 0 && Number(valueDigits) > 0 && confidence != null;
  const baseOk = headline.trim().length >= 2 && industry.trim().length >= 2 && (!needsTerms || terms);

  function submit(withValuation: boolean) {
    const fd = new FormData();
    fd.set("url", v.url);
    fd.set("headline", headline);
    fd.set("industry", industry);
    fd.set("tags", tags);
    fd.set("state", state);
    fd.set("metro", metro);
    fd.set("askingPrice", ask);
    fd.set("revenue", revenue);
    fd.set("revenuePeriod", revenuePeriod);
    fd.set("earnings", earnings);
    fd.set("earningsType", earningsType);
    fd.set("includesInventory", inv);
    fd.set("includesNwc", nwc);
    fd.set("includesRealEstate", re);
    fd.set("dealTermsNote", note);
    fd.set("withValuation", withValuation ? "1" : "0");
    if (withValuation) {
      fd.set("value", valueDigits);
      if (confidence) fd.set("confidence", confidence);
      fd.set("rationale", rationale);
    }
    if (terms) fd.set("acceptTerms", "true");
    fd.set("extracted", JSON.stringify(f));
    if (f.title) fd.set("listingTitleRaw", f.title);
    start(async () => {
      setResult(await submitListingAction(fd));
    });
  }

  if (result && (result.status === "approved" || result.status === "pending_review" || result.status === "duplicate")) {
    return <SubmitOutcome r={result} />;
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (baseOk && valuationReady) submit(true);
      }}
    >
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Detected facts</h2>
          <span className="text-xs text-muted">
            {v.publisher ?? v.domain} · extraction quality {f.quality}
          </span>
        </div>
        {v.fetchError ? (
          <Notice tone="warn" className="mt-3">
            We could not read the page ({v.fetchError}). Enter the facts by hand from the listing.
          </Notice>
        ) : (
          <p className="mt-1 text-sm text-muted">Correct anything that looks wrong. Keep the headline neutral: what the business does, not the broker&apos;s title.</p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Headline" hint="e.g. HVAC services">
            <input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} required />
          </Field>
          <Field label="Industry">
            <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={80} required />
          </Field>
          <Field label="Tags" hint="Comma separated, optional">
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="services, residential, recurring" />
          </Field>
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <Field label="State">
              <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">Unknown</option>
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Metro">
              <input className="input" value={metro} onChange={(e) => setMetro(e.target.value)} maxLength={80} placeholder="Tampa Bay" />
            </Field>
          </div>
          <MoneyInput label="Asking price" name="askingPrice" value={ask} onChange={setAsk} hint="Treated as an enterprise value ask. Leave blank if not listed." placeholder="Not listed" />
          <MoneyInput label="Revenue" name="revenue" value={revenue} onChange={setRevenue} hint="Annual revenue as listed." placeholder="Not listed" />
          <Field label="Revenue period">
            <input className="input" value={revenuePeriod} onChange={(e) => setRevenuePeriod(e.target.value)} maxLength={30} placeholder="TTM, FY2025" />
          </Field>
          <MoneyInput label="Earnings" name="earnings" value={earnings} onChange={setEarnings} hint="SDE, EBITDA or seller cash flow as listed." placeholder="Not listed" />
          <Field label="Earnings type">
            <select className="input" value={earningsType} onChange={(e) => setEarningsType(e.target.value as typeof earningsType)}>
              <option value="unknown">Unknown</option>
              <option value="sde">SDE</option>
              <option value="ebitda">EBITDA</option>
              <option value="seller_cash_flow">Seller cash flow</option>
            </select>
          </Field>
          <TriField label="Inventory included" value={inv} onChange={setInv} />
          <TriField label="Working capital included" value={nwc} onChange={setNwc} />
          <TriField label="Real estate included" value={re} onChange={setRe} />
          <Field label="Deal terms note" hint="Optional, factual, 500 characters">
            <textarea className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">What do you think this business is worth?</h2>
        <p className="mt-1 text-sm text-muted">You would be the first to value this listing, so the full point ranges apply.</p>
        <div className="mt-4 space-y-5">
          <MoneyInput label="Your enterprise value estimate" name="value" value={value} onChange={setValue} hint="Cash-free, debt-free enterprise value. Optional if you only want to submit the URL." />
          <ConfidencePicker value={confidence} onChange={setConfidence} bounds={v.bounds} name="confidence-new" />
          <div>
            <label htmlFor="why-new" className="label">
              Why? <span className="text-muted">(optional, private)</span>
            </label>
            <textarea id="why-new" className="input" rows={2} maxLength={500} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            <p className="mt-1 text-xs text-muted">Do not include confidential or NDA-restricted information.</p>
          </div>
        </div>
      </Card>

      {needsTerms ? <TermsCheckbox checked={terms} onChange={setTerms} id="terms-new" /> : null}

      {result && result.status !== "approved" && result.status !== "pending_review" && result.status !== "duplicate" ? <Notice tone="error">{result.message}</Notice> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || !baseOk || !valuationReady}>
          {pending ? "Submitting" : "Submit URL + valuation"}
        </Button>
        <Button type="button" variant="secondary" size="lg" disabled={pending || !baseOk} onClick={() => submit(false)}>
          Submit URL only
        </Button>
        <span className="text-xs text-muted">URL only earns no points.</span>
      </div>
      {confidence ? (
        <p className="text-sm text-muted">
          Frozen range on submit: <PointsRange maxLoss={v.bounds[confidence].maxLoss} maxGain={v.bounds[confidence].maxGain} showBar={false} />
        </p>
      ) : null}
    </form>
  );
}

function SubmitOutcome({ r }: { r: Extract<SubmitListingResult, { status: "approved" | "pending_review" | "duplicate" }> }) {
  if (r.status === "pending_review") {
    return (
      <Card>
        <p className="text-sm text-accent">Awaiting review</p>
        <h2 className="text-xl font-semibold">Listing saved</h2>
        <p className="mt-2 text-sm text-text/90">{r.message}</p>
        <div className="mt-4 flex gap-3">
          <ButtonLink href="/value" variant="secondary">
            Back to the queue
          </ButtonLink>
        </div>
      </Card>
    );
  }
  if (r.status === "duplicate") {
    return (
      <Card>
        <h2 className="text-xl font-semibold">Already on PriceAFirm</h2>
        <p className="mt-2 text-sm text-text/90">{r.message}</p>
        <div className="mt-4 flex gap-3">
          <ButtonLink href={`/value/${r.snapshotId}`}>Open the listing</ButtonLink>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <p className="text-sm text-pos">Listing published</p>
      <h2 className="text-xl font-semibold">{r.valuation === "sealed" ? "URL added and valuation sealed" : "URL added"}</h2>
      {r.valuation === "sealed" ? (
        <p className="mt-2 text-sm">
          Possible: <PointsRange maxLoss={r.maxLoss ?? 0} maxGain={r.maxGain ?? 0} />. Your score starts at 0.0 and your balance may rise or fall as additional independent opinions
          arrive. Revealing this listing&apos;s URL is free for you.
        </p>
      ) : r.valuation === "failed" ? (
        <Notice tone="warn" className="mt-3">
          {r.valuationMessage}
        </Notice>
      ) : (
        <p className="mt-2 text-sm text-muted">No points were awarded for the URL. You can still value it from the queue.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {r.valuation === "sealed" ? (
          <ButtonLink href={`/value/${r.snapshotId}/done`}>See your valuation</ButtonLink>
        ) : (
          <ButtonLink href={`/value/${r.snapshotId}`}>Value it now</ButtonLink>
        )}
        <Link href="/add" className="btn btn-secondary">
          Add another
        </Link>
      </div>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function TriField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not stated</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </Field>
  );
}
