import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { loadApprovedListings, loadUserBusinessState, type ApprovedListing } from "@/lib/discovery/listings";
import { capFromParticipation } from "@/lib/discovery/question";
import { EARNINGS_LABEL, type ListingSnapshot } from "@/lib/domain/types";
import { Card, EmptyState, Money, PageHeader, ScoreRange, fmtDate, locationText, valuationsText } from "@/components/ui";
import { ValueFilters } from "./ValueFilters";

export const metadata = { title: "Value Businesses" };

type BuyerProfile = { states?: string[]; industries?: string[]; minEarnings?: number };

function fitScore(s: ListingSnapshot, p: BuyerProfile): number {
  let n = 0;
  if (p.states?.length && s.state && p.states.map((x) => x.toUpperCase()).includes(s.state.toUpperCase())) n++;
  if (p.industries?.length) {
    const hay = `${s.industry} ${s.headline} ${s.industry_tags.join(" ")}`.toLowerCase();
    if (p.industries.some((i) => hay.includes(i.toLowerCase()))) n++;
  }
  if (p.minEarnings != null && s.earnings != null && s.earnings >= p.minEarnings) n++;
  return n;
}

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export type ValueSort = "max" | "fit" | "count";

export default async function ValuePage({ searchParams }: PageProps<"/value">) {
  const sp = await searchParams;
  const { user, profile } = await requireMember();
  const sortRaw = first(sp.sort);
  const sort: ValueSort = sortRaw === "fit" ? "fit" : sortRaw === "count" ? "count" : "max";
  const fState = first(sp.state).trim().toUpperCase();
  const fIndustry = first(sp.industry).trim().toLowerCase();
  const fMin = Number(first(sp.minEarnings).replace(/[^0-9.]/g, "")) || 0;

  const [listings, mine] = await Promise.all([loadApprovedListings(), loadUserBusinessState(user.id)]);
  const buyer = (profile.buyer_profile ?? {}) as BuyerProfile;

  const filtered = listings.filter(({ snapshot: s }) => {
    if (fState && (s.state ?? "").toUpperCase() !== fState) return false;
    if (fIndustry && !`${s.industry} ${s.headline} ${s.industry_tags.join(" ")}`.toLowerCase().includes(fIndustry)) return false;
    if (fMin && (s.earnings ?? 0) < fMin) return false;
    return true;
  });

  const eligible: ApprovedListing[] = [];
  const valued: ApprovedListing[] = [];
  const exposed: ApprovedListing[] = [];
  for (const l of filtered) {
    if (mine.valued.has(l.snapshot.business_id)) valued.push(l);
    else if (mine.exposed.has(l.snapshot.business_id)) exposed.push(l);
    else eligible.push(l);
  }

  const cap = (l: ApprovedListing) => capFromParticipation(l.counts.n_eff);
  eligible.sort((a, b) => {
    if (sort === "fit") {
      const d = fitScore(b.snapshot, buyer) - fitScore(a.snapshot, buyer);
      if (d !== 0) return d;
    }
    if (sort === "count") {
      const d = a.counts.n_count - b.counts.n_count;
      if (d !== 0) return d;
    }
    const d = cap(b) - cap(a);
    if (d !== 0) return d;
    return b.snapshot.created_at.localeCompare(a.snapshot.created_at);
  });

  const states = [...new Set(listings.map((l) => l.snapshot.state).filter((s): s is string => Boolean(s)))].sort();
  const hasBuyerProfile = Boolean(buyer.states?.length || buyer.industries?.length || buyer.minEarnings);

  return (
    <div>
      <PageHeader
        title="Value businesses"
        lede="Neutral listing facts only. Submit one enterprise value estimate with your confidence; the possible score range is frozen the moment you submit."
      />

      <ValueFilters states={states} sort={sort} state={fState} industry={fIndustry} minEarnings={fMin ? String(fMin) : ""} hasBuyerProfile={hasBuyerProfile} />

      {eligible.length === 0 ? (
        <EmptyState
          title={filtered.length === 0 && listings.length > 0 ? "No listings match these filters" : listings.length === 0 ? "No listings are open for valuation yet" : "You have valued or seen every open listing"}
          action={
            <Link href="/add" className="btn btn-secondary btn-sm">
              Add a listing
            </Link>
          }
        >
          {listings.length === 0 ? "Listings appear here once a member adds a public broker URL." : "Add a listing URL to open a new valuation question, or come back when new listings arrive."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {eligible.map((l) => (
            <ListingCard key={l.snapshot.id} listing={l} />
          ))}
        </ul>
      )}

      {valued.length > 0 ? (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm font-medium text-muted hover:text-text">Already valued ({valued.length})</summary>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {valued.map((l) => (
              <li key={l.snapshot.id} className="card card-pad flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{l.snapshot.headline}</p>
                  <p className="text-muted">
                    {l.snapshot.industry} · {locationText(l.snapshot)}
                  </p>
                </div>
                <Link href={`/value/${mine.valued.get(l.snapshot.business_id) ?? l.snapshot.id}/done`} className="btn btn-ghost btn-sm">
                  Your valuation
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {exposed.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-muted hover:text-text">Not eligible, you saw this listing in Find deals ({exposed.length})</summary>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {exposed.map((l) => (
              <li key={l.snapshot.id} className="card card-pad text-sm">
                <p className="font-medium">{l.snapshot.headline}</p>
                <p className="text-muted">
                  {l.snapshot.industry} · {locationText(l.snapshot)}
                </p>
                <p className="mt-1 text-xs text-muted">You saw crowd valuations for this listing, so a scored valuation is not available.</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ListingCard({ listing }: { listing: ApprovedListing }) {
  const s = listing.snapshot;
  const c = capFromParticipation(listing.counts.n_eff);
  return (
    <Card as="li" pad={false} className="flex flex-col">
      <Link href={`/value/${s.id}`} className="group flex flex-1 flex-col p-5 no-underline">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug group-hover:underline">{s.headline}</h2>
            <p className="mt-0.5 text-sm text-muted">{s.industry}</p>
            <p className="text-sm text-muted">{locationText(s)}</p>
          </div>
          <div className="text-right">
            <p className="figures text-xl font-semibold text-accent-text">±{c.toFixed(1)}</p>
            <p className="text-xs text-muted">possible score</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-4 gap-3">
          <div>
            <dt className="text-xs text-muted">Ask</dt>
            <dd className="figures text-[15px]">
              <Money value={s.asking_price} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Revenue</dt>
            <dd className="figures text-[15px]">
              <Money value={s.revenue} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{s.earnings_type === "unknown" ? "Earnings" : EARNINGS_LABEL[s.earnings_type]}</dt>
            <dd className="figures text-[15px]">
              <Money value={s.earnings} />
            </dd>
            {s.earnings_type === "unknown" && s.earnings != null ? <dd className="text-[11px] text-muted">basis unknown</dd> : null}
          </div>
          <div>
            <dt className="text-xs text-muted">Valuations</dt>
            <dd className="figures text-[15px]">{listing.counts.n_count}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted">
          <span>
            Snapshot <span className="figures">{fmtDate(s.snapshot_date)}</span> · {valuationsText(listing.counts.n_count)}
          </span>
          <span>
            Possible score <ScoreRange cap={c} />
          </span>
        </div>
      </Link>
    </Card>
  );
}
