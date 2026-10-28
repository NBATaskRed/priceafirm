import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { loadApprovedListings, loadUserBusinessState, type ApprovedListing } from "@/lib/discovery/listings";
import { capFromParticipation } from "@/lib/discovery/question";
import type { ListingSnapshot } from "@/lib/domain/types";
import { EmptyState, Money, PageHeader, earningsLabel, placeText } from "@/components/ui";
import { SortControl, ValueFilters } from "./ValueFilters";

export const metadata = { title: "Value businesses" };

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
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Value businesses"
        lede="Say what a business is worth and earn points when other buyers agree later. The fewer valuations a listing has, the more points are at stake."
        aside={<SortControl sort={sort} state={fState} industry={fIndustry} minEarnings={fMin ? String(fMin) : ""} />}
      />

      <ValueFilters states={states} sort={sort} state={fState} industry={fIndustry} minEarnings={fMin ? String(fMin) : ""} hasBuyerProfile={hasBuyerProfile} />

      {eligible.length === 0 ? (
        <EmptyState
          title={filtered.length === 0 && listings.length > 0 ? "No listings match these filters" : listings.length === 0 ? "No listings are open for valuation yet" : "You've valued or seen every open listing"}
          action={
            <Link href="/add" className="btn btn-secondary btn-sm">
              Add a listing
            </Link>
          }
        >
          {listings.length === 0 ? "Listings appear here once a member adds a broker listing URL." : "Add a listing URL to open a new one, or come back when new listings arrive."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col border-t border-border">
          {eligible.map((l) => (
            <ListingRow key={l.snapshot.id} listing={l} />
          ))}
        </ul>
      )}

      <p className="text-sm text-muted">Nothing here shows what other buyers think, so valuing stays blind. You&apos;ll see the combined view right after you lock in your number.</p>

      {valued.length > 0 ? (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted hover:text-text">Already valued ({valued.length})</summary>
          <ul className="mt-2 flex flex-col border-t border-border">
            {valued.map((l) => (
              <li key={l.snapshot.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-2 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{l.snapshot.headline}</p>
                  <p className="text-muted">{placeText(l.snapshot)}</p>
                </div>
                <Link href={`/value/${mine.valued.get(l.snapshot.business_id) ?? l.snapshot.id}/done`} className="btn btn-secondary btn-sm">
                  Your valuation
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {exposed.length > 0 ? (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted hover:text-text">Seen in Find deals, can&apos;t earn points ({exposed.length})</summary>
          <ul className="mt-2 flex flex-col border-t border-border">
            {exposed.map((l) => (
              <li key={l.snapshot.id} className="border-b border-border px-2 py-3 text-sm">
                <p className="font-semibold">{l.snapshot.headline}</p>
                <p className="text-muted">{placeText(l.snapshot)}</p>
                <p className="mt-1 text-[13px] text-muted">You&apos;ve seen what buyers think of this one, so valuing it can&apos;t earn points.</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function countText(n: number): string {
  if (n <= 0) return "No valuations yet";
  return n === 1 ? "1 valuation so far" : `${n} valuations so far`;
}

function ListingRow({ listing }: { listing: ApprovedListing }) {
  const s = listing.snapshot;
  const c = capFromParticipation(listing.counts.n_eff);
  return (
    <li className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[4px] border-b border-border px-2 py-5 hover:bg-surface-2 md:px-4">
      <div className="min-w-0 flex-[1_1_260px]">
        <h2 className="text-[19px] font-bold leading-snug">{s.headline}</h2>
        <p className="mt-1 text-sm text-muted">
          {placeText(s)} · {s.industry}
        </p>
      </div>
      <dl className="grid flex-[1_1_320px] grid-cols-3 gap-6">
        <div>
          <dt className="tile-label">Asking</dt>
          <dd className="figures mt-0.5 text-[17px] font-bold">
            <Money value={s.asking_price} />
          </dd>
        </div>
        <div>
          <dt className="tile-label">Revenue</dt>
          <dd className="figures mt-0.5 text-[17px] font-bold">
            <Money value={s.revenue} />
          </dd>
        </div>
        <div>
          <dt className="tile-label">{earningsLabel(s.earnings_type)}</dt>
          <dd className="figures mt-0.5 text-[17px] font-bold">
            <Money value={s.earnings} />
          </dd>
        </div>
      </dl>
      <div className="flex flex-[1_0_auto] items-center justify-between gap-5 sm:flex-none">
        <div className="min-w-[120px] sm:text-right">
          <p className="figures text-[26px] font-extrabold leading-tight text-accent-text">
            <span className="sr-only">Points at stake </span>&plusmn;{c.toFixed(1)}
          </p>
          <p className="figures text-[13px] text-muted">{countText(listing.counts.n_count)}</p>
        </div>
        <Link href={`/value/${s.id}`} className="btn btn-invert" aria-label={`Value it: ${s.headline}, ${placeText(s)}`}>
          Value it
        </Link>
      </div>
    </li>
  );
}
