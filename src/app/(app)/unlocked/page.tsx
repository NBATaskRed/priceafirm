import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadCrowdStats, loadSourceMap } from "@/lib/discovery/listings";
import type { ListingSnapshot } from "@/lib/domain/types";
import { Card, EmptyState, FactTiles, PageHeader, fmtDate, placeText } from "@/components/ui";
import { CrowdStats } from "@/components/CrowdStats";

export const metadata = { title: "Opened listings" };

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
        <PageHeader title="Opened listings" lede="Every broker listing you've opened, with the facts and what buyers think as it stands now." />
        <EmptyState
          title="No opened listings yet"
          action={
            <Link href="/deals" className="btn btn-primary btn-sm">
              Find deals
            </Link>
          }
        >
          Find a deal, then choose See the broker listing. It&apos;s free below 3 valuations and 1 point from 3 on.
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
  const sourceRows = new Map<string, SourceRow>();
  for (const s of (src ?? []) as SourceRow[]) sourceRows.set(s.snapshot_id, s);
  const sources = await loadSourceMap([...snaps.values()].map((s) => s.source_domain));

  const items = await Promise.all(
    unlocks.map(async (u) => {
      const s = snaps.get(u.snapshot_id);
      if (!s) return null;
      const src = sources.get(s.source_domain) ?? null;
      const stats = await loadCrowdStats(s);
      return { u, s, src: sourceRows.get(u.snapshot_id) ?? null, stats, source: src };
    }),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Opened listings" lede="Every broker listing you've opened, with the facts and what buyers think as it stands now." />
      <ul className="flex flex-col gap-4">
        {items.map((it) => {
          if (!it) return null;
          const { u, s, src, stats, source } = it;
          const host = src ? safeHost(src.source_url) : null;
          return (
            <Card as="li" key={u.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[19px] font-bold leading-snug">{s.headline}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {placeText(s)} · {s.industry} · facts as of <span className="figures">{fmtDate(s.snapshot_date)}</span>
                  </p>
                </div>
                <span className="chip">
                  {u.charged ? "1 point used" : "Free"} · <span className="figures">&nbsp;{fmtDate(u.created_at)}</span>
                </span>
              </div>

              <FactTiles snapshot={s} tone="surface-2" className="mt-4" />

              <div className="mt-5 border-t border-border pt-4">
                <CrowdStats stats={stats} headingLevel={3} />
              </div>

              <div className="mt-5 border-t border-border pt-4">
                {src ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <a href={src.source_url} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-secondary">
                      Open broker listing
                    </a>
                    {host ? <span className="text-sm text-muted">{host}</span> : null}
                    <span className="text-sm text-muted">· {src.broker_name ?? source?.publisher ?? s.source_domain}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted">The broker listing is no longer available.</p>
                )}
                {src ? <p className="mt-2 break-all text-xs text-muted">{src.source_url}</p> : null}
                {source?.attribution_text ? <p className="mt-1 text-xs text-muted">{source.attribution_text}</p> : null}
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
