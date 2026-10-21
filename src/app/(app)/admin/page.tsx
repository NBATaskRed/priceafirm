import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ListingSnapshot, SourceRights } from "@/lib/domain/types";
import { Card, EmptyState, Money, PageHeader, fmtDate, locationText } from "@/components/ui";
import { ActionButton, AddDomainForm, AddInviteForm, RecomputeButton, RightToggle, SourceStatusSelect } from "./AdminControls";

export const metadata = { title: "Admin" };

const TABS = [
  { key: "sources", label: "Sources" },
  { key: "review", label: "Review queue" },
  { key: "invites", label: "Invites" },
  { key: "scoring", label: "Scoring" },
  { key: "audit", label: "Audit" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const RIGHTS: Array<{ key: keyof SourceRights & string; label: string }> = [
  { key: "may_fetch", label: "Fetch" },
  { key: "may_store", label: "Store" },
  { key: "may_display_ask", label: "Show ask" },
  { key: "may_display_ev_to_ask", label: "EV/ask" },
  { key: "may_show_anonymous_preview", label: "Preview" },
  { key: "may_link_original_listing", label: "Link URL" },
  { key: "attribution_required", label: "Attribution" },
];

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await searchParams;
  const tabRaw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: TabKey = (TABS.find((t) => t.key === tabRaw)?.key ?? "sources") as TabKey;
  const admin = supabaseAdmin();

  const { count: pendingCount } = await admin.from("listing_snapshots").select("id", { count: "exact", head: true }).eq("status", "pending_review");

  return (
    <div>
      <PageHeader title="Admin" lede="Sources, review, invites and scoring for the pilot. Every action here is written to the audit log." />
      <nav aria-label="Admin sections" className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin?tab=${t.key}`} className="nav-link" aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
            {t.key === "review" && pendingCount ? <span className="figures ml-1.5 rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-ink">{pendingCount}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "sources" ? <SourcesTab /> : null}
      {tab === "review" ? <ReviewTab /> : null}
      {tab === "invites" ? <InvitesTab /> : null}
      {tab === "scoring" ? <ScoringTab /> : null}
      {tab === "audit" ? <AuditTab /> : null}
    </div>
  );
}

async function SourcesTab() {
  const { data } = await supabaseAdmin().from("source_domains").select("*").order("status").order("domain");
  const rows = (data ?? []) as Array<SourceRights & { policy_note: string | null; effective_date: string | null }>;
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-base font-semibold">Add a domain</h2>
        <AddDomainForm />
      </Card>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Status</th>
              {RIGHTS.map((r) => (
                <th key={r.key}>{r.label}</th>
              ))}
              <th>Publisher</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.domain}>
                <td className="font-medium">
                  {r.domain}
                  {r.revoked_at ? <span className="block text-xs text-neg">revoked {fmtDate(r.revoked_at)}</span> : null}
                </td>
                <td>
                  <SourceStatusSelect domain={r.domain} status={r.status} />
                </td>
                {RIGHTS.map((f) => (
                  <td key={f.key}>
                    <RightToggle domain={r.domain} flag={f.key} value={Boolean(r[f.key])} label={`${f.label} for ${r.domain}`} />
                  </td>
                ))}
                <td className="text-muted">
                  {r.publisher ?? ""}
                  {r.policy_note ? <span className="block max-w-xs text-xs">{r.policy_note}</span> : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={RIGHTS.length + 3} className="text-muted">
                  No domains yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function ReviewTab() {
  const admin = supabaseAdmin();
  const { data } = await admin.from("listing_snapshots").select("*").eq("status", "pending_review").order("created_at", { ascending: true });
  const rows = (data ?? []) as ListingSnapshot[];
  if (!rows.length) return <EmptyState title="The review queue is empty">New listings from sources without automatic approval appear here.</EmptyState>;

  const ids = rows.map((r) => r.id);
  const { data: src } = await admin.from("listing_sources").select("snapshot_id,source_url,listing_title_raw,broker_name").in("snapshot_id", ids);
  const sources = new Map<string, { source_url: string; listing_title_raw: string | null; broker_name: string | null }>();
  for (const s of (src ?? []) as Array<{ snapshot_id: string; source_url: string; listing_title_raw: string | null; broker_name: string | null }>) sources.set(s.snapshot_id, s);
  const submitters = [...new Set(rows.map((r) => r.submitted_by).filter((x): x is string => Boolean(x)))];
  const { data: pr } = submitters.length ? await admin.from("profiles").select("id,email").in("id", submitters) : { data: [] };
  const emails = new Map<string, string>();
  for (const p of (pr ?? []) as Array<{ id: string; email: string }>) emails.set(p.id, p.email);

  return (
    <ul className="space-y-4">
      {rows.map((s) => {
        const source = sources.get(s.id);
        return (
          <Card as="li" key={s.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{s.headline}</h2>
                <p className="text-sm text-muted">
                  {s.industry} · {locationText(s)} · {s.source_domain} · submitted {fmtDate(s.created_at)}
                  {s.submitted_by ? ` by ${emails.get(s.submitted_by) ?? "unknown"}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <ActionButton kind="approve" snapshotId={s.id} />
                <ActionButton kind="withdraw" snapshotId={s.id} />
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Ask (EV)</dt>
                <dd>
                  <Money value={s.asking_price} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Revenue</dt>
                <dd>
                  <Money value={s.revenue} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Earnings ({s.earnings_type})</dt>
                <dd>
                  <Money value={s.earnings} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Tags</dt>
                <dd>{s.industry_tags.join(", ") || "none"}</dd>
              </div>
            </dl>
            {source ? (
              <p className="mt-3 break-all text-xs text-muted">
                {source.listing_title_raw ? <span className="block text-text/80">Raw title: {source.listing_title_raw}</span> : null}
                <a href={source.source_url} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                  {source.source_url}
                </a>
              </p>
            ) : null}
            {s.deal_terms_note ? <p className="mt-2 text-sm text-muted">Note: {s.deal_terms_note}</p> : null}
          </Card>
        );
      })}
    </ul>
  );
}

async function InvitesTab() {
  const admin = supabaseAdmin();
  const [{ data: inv }, { data: pr }] = await Promise.all([
    admin.from("invites").select("*").order("created_at", { ascending: false }),
    admin.from("profiles").select("email,invited,created_at,trust_status").order("created_at", { ascending: false }).limit(200),
  ]);
  const invites = (inv ?? []) as Array<{ email: string; note: string | null; created_at: string }>;
  const profiles = (pr ?? []) as Array<{ email: string; invited: boolean; created_at: string; trust_status: string }>;
  const invitedSet = new Set(invites.map((i) => i.email));
  const waiting = profiles.filter((p) => !p.invited);
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-base font-semibold">Invite emails</h2>
        <p className="mt-1 text-sm text-muted">Adding an email lets that person past the waitlist. Existing accounts are flipped immediately.</p>
        <AddInviteForm />
      </Card>
      {waiting.length ? (
        <Card>
          <h2 className="text-base font-semibold">Waiting ({waiting.length})</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {waiting.map((p) => (
              <li key={p.email} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {p.email} <span className="text-xs text-muted">signed up {fmtDate(p.created_at)}</span>
                </span>
                <AddInviteForm compact email={p.email} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Account</th>
              <th>Note</th>
              <th>Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => {
              const p = profiles.find((x) => x.email === i.email);
              return (
                <tr key={i.email}>
                  <td className="font-medium">{i.email}</td>
                  <td className="text-muted">{p ? `signed up · ${p.trust_status}` : "not yet"}</td>
                  <td className="text-muted">{i.note}</td>
                  <td className="figures text-muted">{fmtDate(i.created_at)}</td>
                  <td>
                    <ActionButton kind="remove_invite" email={i.email} />
                  </td>
                </tr>
              );
            })}
            {invites.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted">
                  No invites yet. {invitedSet.size}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function ScoringTab() {
  const admin = supabaseAdmin();
  const [{ count: approved }, { count: forecasts }, { count: evals }, { data: agg }] = await Promise.all([
    admin.from("listing_snapshots").select("id", { count: "exact", head: true }).eq("status", "approved"),
    admin.from("forecast_submissions").select("id", { count: "exact", head: true }),
    admin.from("score_evaluations").select("id", { count: "exact", head: true }),
    admin.from("aggregation_cache").select("updated_at").order("updated_at", { ascending: false }).limit(1),
  ]);
  const last = (agg as Array<{ updated_at: string }> | null)?.[0]?.updated_at ?? null;
  const mode = process.env.SCORING_MODE ?? "live";
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              Scoring mode: <span className={mode === "shadow" ? "text-accent" : "text-pos"}>{mode}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              {mode === "shadow" ? "Scores are computed and logged but no point deltas are posted." : "Score deltas post to the ledger as later valuations arrive."} Change with
              SCORING_MODE.
            </p>
          </div>
          <RecomputeButton />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Approved snapshots</dt>
            <dd className="figures text-lg">{approved ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Forecasts</dt>
            <dd className="figures text-lg">{forecasts ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Score evaluations</dt>
            <dd className="figures text-lg">{evals ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Last aggregate refresh</dt>
            <dd className="figures text-lg">{last ? new Date(last).toLocaleString("en-US", { timeZone: "UTC", hour12: false }) + " UTC" : "never"}</dd>
          </div>
        </dl>
      </Card>
      <p className="text-xs text-muted">A daily cron at 06:00 UTC calls /api/cron/recompute with the CRON_SECRET bearer token and does the same work.</p>
    </div>
  );
}

async function AuditTab() {
  const admin = supabaseAdmin();
  const { data } = await admin.from("admin_audit").select("*").order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as Array<{ id: number; actor: string | null; action: string; target: string | null; payload: unknown; created_at: string }>;
  const actors = [...new Set(rows.map((r) => r.actor).filter((x): x is string => Boolean(x)))];
  const { data: pr } = actors.length ? await admin.from("profiles").select("id,email").in("id", actors) : { data: [] };
  const emails = new Map<string, string>();
  for (const p of (pr ?? []) as Array<{ id: string; email: string }>) emails.set(p.id, p.email);
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Payload</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="figures whitespace-nowrap text-muted">{new Date(r.created_at).toLocaleString("en-US", { timeZone: "UTC", hour12: false })}</td>
              <td>{r.actor ? emails.get(r.actor) ?? r.actor.slice(0, 8) : "system"}</td>
              <td className="font-medium">{r.action}</td>
              <td className="break-all text-muted">{r.target}</td>
              <td className="figures max-w-md break-all text-xs text-muted">{r.payload ? JSON.stringify(r.payload) : ""}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-muted">
                No admin actions recorded yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
