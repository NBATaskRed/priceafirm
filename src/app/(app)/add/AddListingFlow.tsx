"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { impliedMultiple, type Confidence } from "@/lib/domain/types";
import { submitListingAction, validateUrlAction, type SubmitListingResult, type ValidateUrlResult } from "@/lib/actions/listing";
import { Button, ButtonLink, Card, FactTiles, Notice, othersValuedText, placeText } from "@/components/ui";
import { StakeTile, ValuationForm } from "@/components/ValuationForm";
import { ConfidencePicker } from "@/components/ConfidencePicker";
import { EvInput, MoneyInput } from "@/components/MoneyInput";
import { ValueBand } from "@/components/ValueBand";
import { TermsCheckbox } from "@/components/TermsCheckbox";

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export function AddListingFlow({ needsTerms }: { needsTerms: boolean }) {
  const [url, setUrl] = useState("");
  const [validation, setValidation] = useState<ValidateUrlResult | null>(null);
  const [pending, start] = useTransition();

  function check() {
    const raw = url.trim();
    if (!raw) return;
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
            Broker listing URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="listing-url"
              className="input input-lg"
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
            <Button type="submit" size="lg" disabled={pending || !url.trim()} className="sm:w-40">
              {pending && !validation ? "Checking" : "Check URL"}
            </Button>
          </div>
          <p className="mt-2 text-[13px] text-muted">Any public broker page works. Excluded sources are turned away before anything is fetched, and tracking parameters are removed.</p>
        </form>
      </Card>

      {validation?.status === "blocked" ? (
        <Notice tone="error" title="This source isn't allowed in the pilot. Nothing was fetched.">
          {validation.message} ({validation.domain})
        </Notice>
      ) : null}

      {validation?.status === "invalid" ? <Notice tone="error">{validation.message}</Notice> : null}

      {validation?.status === "existing" ? <ExistingListing v={validation} needsTerms={needsTerms} /> : null}

      {validation?.status === "new" ? <NewListingForm key={validation.url} v={validation} needsTerms={needsTerms} /> : null}
    </div>
  );
}

function ExistingListing({ v, needsTerms }: { v: Extract<ValidateUrlResult, { status: "existing" }>; needsTerms: boolean }) {
  return (
    <Card>
      <p className="text-sm text-muted">Already on PriceAFirm</p>
      <h2 className="text-[26px] font-bold leading-[1.15] tracking-[-0.015em]">{v.snapshot.headline}</h2>
      <p className="mt-1 text-[15px] text-muted">
        {placeText(v.snapshot)} · {v.snapshot.industry}
      </p>
      <FactTiles snapshot={v.snapshot} tone="surface-2" className="mt-3" />
      <p className="mt-2 text-[13px] text-muted">{othersValuedText(v.nInd)}</p>
      <div className="mt-5 border-t border-border pt-4">
        {v.exposed ? (
          <Notice tone="warn" title="You've seen what buyers think of this one, so valuing it can't earn points">
            You can still find it in Find deals or Opened listings.
          </Notice>
        ) : v.alreadyValued ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>You already valued this business.</span>
            <ButtonLink href={`/value/${v.snapshotId}/done`} variant="secondary" size="sm">
              See your valuation
            </ButtonLink>
          </div>
        ) : v.contractToken && v.cap != null ? (
          <div>
            <p className="mb-4 text-sm text-muted">Adding the URL again earns nothing; a valuation can.</p>
            <ValuationForm snapshotId={v.snapshotId} contractToken={v.contractToken} cap={v.cap} nInd={v.nInd} ask={v.snapshot.asking_price} earnings={v.snapshot.earnings} earningsType={v.snapshot.earnings_type} needsTerms={needsTerms} compact />
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
  const valueNum = valueDigits && Number(valueDigits) > 0 ? Number(valueDigits) : null;
  const askDigits = ask.replace(/[^0-9]/g, "");
  const askNum = askDigits && Number(askDigits) > 0 ? Number(askDigits) : null;
  const valuationReady = valueNum != null && confidence != null;
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
    if (v.fetchError) fd.set("fetchError", v.fetchError);
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
          <h2 className="text-[17px] font-semibold">Check the facts</h2>
          <span className="text-xs text-muted">
            {v.publisher ?? v.domain} · {v.sourceType === "operator" ? "broker's own site" : "third-party site"} · read quality {f.quality}
          </span>
        </div>
        {v.fetchError ? (
          <Notice tone="warn" className="mt-3">
            We could not read the page ({v.fetchError}). Enter the facts by hand from the listing; the snapshot will get a quick check before it opens for valuation.
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

      <Card className="flex flex-col gap-[18px]">
        <p className="text-[13px] text-muted">{othersValuedText(0)}. You&apos;d be first, so the most points are at stake.</p>
        <EvInput id="ev-new" label="What do you think it's worth?" value={value} onChange={setValue} multiple={impliedMultipleText(valueDigits, earnings, earningsType)} />
        <ValueBand ask={askNum} value={valueNum} confidence={confidence} />
        <ConfidencePicker value={confidence} onChange={setConfidence} estimate={valueNum} name="confidence-new" />
        <details className="text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center text-muted hover:text-text">Add a private note (optional)</summary>
          <label htmlFor="why-new" className="label mt-1">
            Why you picked this number. Only you see it.
          </label>
          <textarea id="why-new" className="input" rows={2} maxLength={500} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          <p className="mt-1 text-xs text-muted">Leave out anything confidential or covered by an NDA.</p>
        </details>
      </Card>

      {result ? <Notice tone="error">{result.message}</Notice> : null}

      <div className="flex flex-col gap-2.5">
        <StakeTile cap={v.cap} />
        {needsTerms ? <TermsCheckbox checked={terms} onChange={setTerms} id="terms-new" /> : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending || !baseOk || !valuationReady}>
          {pending ? "Locking in" : "Lock in my valuation"}
        </Button>
        <Button type="button" variant="secondary" size="lg" className="w-full" disabled={pending || !baseOk} onClick={() => submit(false)}>
          Add the listing only
        </Button>
        <p className="text-center text-[13px] text-muted">Adding the listing alone earns no points.</p>
      </div>
    </form>
  );
}

function SubmitOutcome({ r }: { r: Extract<SubmitListingResult, { status: "approved" | "pending_review" | "duplicate" }> }) {
  if (r.status === "pending_review") {
    return (
      <Card>
        <p className="text-sm text-accent-text">Waiting for a quick check</p>
        <h2 className="text-[19px] font-bold">Listing saved</h2>
        <p className="mt-2 text-sm text-text-soft">{r.message}</p>
        <div className="mt-4 flex gap-3">
          <ButtonLink href="/value" variant="secondary">
            Value businesses
          </ButtonLink>
        </div>
      </Card>
    );
  }
  if (r.status === "duplicate") {
    return (
      <Card>
        <h2 className="text-[19px] font-bold">Already on PriceAFirm</h2>
        <p className="mt-2 text-sm text-text-soft">{r.message}</p>
        <div className="mt-4 flex gap-3">
          <ButtonLink href={`/value/${r.snapshotId}`}>Open the listing</ButtonLink>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <p className="text-sm text-pos">Listing added</p>
      <h2 className="text-[19px] font-bold">{r.valuation === "sealed" ? "Listing added and valuation locked in" : "Listing added"}</h2>
      {r.valuation === "sealed" ? (
        <p className="mt-2 text-sm text-text-soft">
          Points at stake <span className="figures font-bold text-text">&plusmn;{(r.cap ?? 0).toFixed(1)}</span>. Your score starts at 0.0 and moves as other buyers value this
          business. Seeing the broker listing is free for you.
        </p>
      ) : r.valuation === "failed" ? (
        <Notice tone="warn" className="mt-3">
          {r.valuationMessage}
        </Notice>
      ) : (
        <p className="mt-2 text-sm text-muted">Adding a listing earns no points. You can still value it in Value businesses.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {r.valuation === "sealed" ? (
          <ButtonLink href={`/value/${r.snapshotId}/done`}>See what buyers think</ButtonLink>
        ) : (
          <ButtonLink href={`/value/${r.snapshotId}`}>Value it</ButtonLink>
        )}
        <Link href="/add" className="btn btn-secondary">
          Add another
        </Link>
      </div>
    </Card>
  );
}

function impliedMultipleText(digits: string, earnings: string, earningsType: "sde" | "ebitda" | "seller_cash_flow" | "unknown"): string | null {
  const ev = Number(digits);
  const e = Number(earnings.replace(/[^0-9]/g, ""));
  const m = ev > 0 && e > 0 ? impliedMultiple(ev, { earnings: e, earnings_type: earningsType }) : null;
  return m ? `= ${m}` : null;
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
