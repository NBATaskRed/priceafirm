import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadCrowdStats, loadRightsMap } from "@/lib/discovery/listings";
import type { ListingSnapshot } from "@/lib/domain/types";
import { Card, EmptyState, EvidenceBadge, FactsGrid, PageHeader, fmtDate, locationText } from "@/components/ui";
import { CrowdStats } from "@/components/CrowdStats";

export const metadata = { title: "My Unlocked Listings" };

type UnlockRow = { id: string; business_id: string; snapshot_id: string; charged: boolean; created_at: string };
type SourceRow = { snapshot_id: string; source_url: string; broker_name: string | null };

export default async function UnlockedPage() {
  const { user } = await requireMember();
  const admin = supabaseAdmin();

  const { data: un } = await admin.from("url_unlocks").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  const unlocks = (un ?? []) as UnlockRow[];

  if (!unlocks.length) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="My unlocked listings" lede="Every original listing URL you have revealed, with the facts and crowd view as they stand now." />
        <EmptyState
          title="No unlocked listings yet"
          action={
            <Link href="/deals" className="btn btn-primary btn-sm">
              Find deals
            </Link>
          }
        >
          Preview an opportunity in Find deals, then reveal its original listing URL for 1 point.
        </EmptyState>
      </div>
    );
  }

  const snapIds = unlocks.map((u) => u.snapshot_id);
  const [{ data: sn }, { data: src }] = await Promise.all([
    admin.from("listing_snapshots").select("*").in("id", snapIds),
    // The caller's own unlocks only: these rows were released to them by reveal_url.
    admin.from("listing_sources").select("snapshot_id,source_url,broker_name").in("snapshot_id", snapIds),
  ]);
  const snaps = new Map<string, ListingSnapshot>();
  for (const s of (sn ?? []) as ListingSnapshot[]) snaps.set(s.id, s);
  const sources = new Map<string, SourceRow>();
  for (const s of (src ?? []) as SourceRow[]) sources.set(s.snapshot_id, s);
  const rights = await loadRightsMap([...snaps.values()].map((s) => s.source_domain));

  const items = await Promise.all(
    unlocks.map(async (u) => {
      const s = snaps.get(u.snapshot_id);
      if (!s) return null;
      const r = rights.get(s.source_domain) ?? null;
      const stats = await loadCrowdStats(s, r);
      return { u, s, src: sources.get(u.snapshot_id) ?? null, stats, rights: r };
    }),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My unlocked listings" lede="Every original listing URL you have revealed, with the facts and crowd view as they stand now." />
      <ul className="space-y-5">
        {items.map((it) => {
          if (!it) return null;
          const { u, s, src, stats, rights: r } = it;
          const host = src ? safeHost(src.source_url) : null;
          return (
            <Card as="li" key={u.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{s.headline}</h2>
                  <p className="text-sm text-muted">
                    {s.industry} · {locationText(s)} · snapshot <span className="figures">{fmtDate(s.snapshot_date)}</span>
                  </p>
                </div>
                <span className="chip">{u.charged ? "Charged 1 point" : "Free"} · {fmtDate(u.created_at)}</span>
              </div>

              <div className="mt-4">
                <FactsGrid snapshot={s} dense showAsk={stats.askingPrice != null} />
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Crowd view</h3>
                  <EvidenceBadge nCount={stats.nCount} evidence={stats.evidence} />
                </div>
                <div className="mt-3">
                  <CrowdStats stats={stats} />
                </div>
              </div>

              <div className="mt-5 border-t border-border pt-4">
                {src ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <a href={src.source_url} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-primary btn-sm">
                      Open listing{host ? ` on ${host}` : ""}
                    </a>
                    <span className="text-sm text-muted">{src.broker_name ?? r?.publisher ?? s.source_domain}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted">The listing URL is no longer available from the source.</p>
                )}
                {src ? <p className="mt-2 break-all text-xs text-muted">{src.source_url}</p> : null}
                {r?.attribution_required && r.publisher ? <p className="mt-1 text-xs text-muted">Listing published by {r.publisher}.</p> : null}
              </div>
            </Card>
          );
        })}
      </ul>
    </div>
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
