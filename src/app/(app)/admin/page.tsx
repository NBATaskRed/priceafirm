import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ListingSnapshot, SourceDomain } from "@/lib/domain/types";
import { CONFIDENCE_LABEL, Card, EmptyState, Money, PageHeader, Points, fmtDate, locationText } from "@/components/ui";
import { ActionButton, AddDomainForm, AddInviteForm, EditFactsForm, InviteRowActions, IssueInviteForm, RecomputeButton, SourceRow, VoidForecastButton } from "./AdminControls";

export const metadata = { title: "Admin" };

const TABS = [
  { key: "sources", label: "Sources" },
  { key: "review", label: "Review queue" },
  { key: "invites", label: "Invites" },
  { key: "scoring", label: "Scoring" },
  { key: "forecasts", label: "Forecasts" },
  { key: "audit", label: "Audit" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

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
      {tab === "forecasts" ? <ForecastsTab /> : null}
      {tab === "audit" ? <AuditTab /> : null}
    </div>
  );
}

async function SourcesTab() {
  const { data } = await supabaseAdmin().from("source_domains").select("*").order("source_type").order("domain");
  const rows = (data ?? []) as Array<SourceDomain & { first_seen: string | null }>;
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-[17px] font-semibold">Record a domain</h2>
        <p className="mt-1 text-sm text-muted">
          Sources are permissionless: any public broker page is accepted and its domain is recorded on first submission. Use this to pre-register an operator
          source, set attribution text, or add a domain to the excluded list.
        </p>
        <AddDomainForm />
      </Card>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Type</th>
              <th>Publisher / attribution</th>
              <th>First seen</th>
              <th>Complaint</th>
              <th>Removed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <SourceRow key={r.domain} source={r} firstSeen={fmtDate(r.first_seen)} />
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted">
                  No domains recorded yet.
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
  const { data: heldRows } = await admin.from("listing_invites").select("snapshot_id").in("snapshot_id", ids).eq("email_status", "pending").is("revoked_at", null);
  const held = new Map<string, number>();
  for (const h of (heldRows ?? []) as Array<{ snapshot_id: string }>) held.set(h.snapshot_id, (held.get(h.snapshot_id) ?? 0) + 1);

  return (
    <ul className="space-y-4">
      {rows.map((s) => {
        const source = sources.get(s.id);
        return (
          <Card as="li" key={s.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[19px] font-bold">{s.headline}</h2>
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
            {held.get(s.id) ? <p className="mt-3 text-sm text-accent-text">{held.get(s.id)} valuation request(s) waiting for this listing; they are emailed when you approve.</p> : null}
            <EditFactsForm
              snapshotId={s.id}
              initial={{ headline: s.headline, industry: s.industry, industry_tags: s.industry_tags, state: s.state, metro: s.metro, asking_price: s.asking_price, revenue: s.revenue, earnings: s.earnings, earnings_type: s.earnings_type }}
            />
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
  const { data: li } = await admin
    .from("listing_invites")
    .select("id,buyer_name,buyer_email,information_level,issued_at,expires_at,first_opened_at,open_count,submitted_at,revoked_at,email_status,email_error,snapshot_id,listing_snapshots(headline,metro,state,status)")
    .order("issued_at", { ascending: false })
    .limit(100);
  type Req = {
    id: string; buyer_name: string | null; buyer_email: string; information_level: string; issued_at: string; expires_at: string;
    first_opened_at: string | null; open_count: number; submitted_at: string | null; revoked_at: string | null; email_status: string; email_error: string | null;
    snapshot_id: string; listing_snapshots: { headline: string; metro: string | null; state: string | null; status: string } | null;
  };
  const requests = (li ?? []) as unknown as Req[];
  const { data: ob } = await admin.from("mail_outbox").select("id,to_email,subject,status,created_at,text_body").order("created_at", { ascending: false }).limit(20);
  const outbox = (ob ?? []) as Array<{ id: string; to_email: string; subject: string; status: string; created_at: string; text_body: string }>;
  const stateOf = (r: Req) =>
    r.revoked_at ? "revoked" : r.submitted_at ? "valued" : r.email_status === "pending" ? "held for listing review" : new Date(r.expires_at) < new Date() ? "expired" : r.first_opened_at ? `opened ${r.open_count}x` : `email ${r.email_status}`;
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-[17px] font-semibold">Send a valuation request</h2>
        <p className="mt-1 text-sm text-muted">
          Same as the invite API: creates the buyer&apos;s account if needed, onboards the listing URL if it is new, and emails a link that signs them in and opens the
          valuation form. Usually sent automatically by the buyer-qualification system after 1 to 2 weeks with materials.
        </p>
        <IssueInviteForm />
      </Card>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Buyer</th>
              <th>Listing</th>
              <th>Status</th>
              <th>Issued</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="font-medium">{r.buyer_name ?? r.buyer_email}</span>
                  <span className="block text-xs text-muted">{r.buyer_email} · {r.information_level}</span>
                </td>
                <td className="text-muted">{r.listing_snapshots ? `${r.listing_snapshots.headline}${r.listing_snapshots.state ? `, ${r.listing_snapshots.state}` : ""}` : r.snapshot_id}</td>
                <td>
                  {stateOf(r)}
                  {r.email_error ? <span className="block text-xs text-neg">{r.email_error}</span> : null}
                </td>
                <td className="figures text-muted">{fmtDate(r.issued_at)}</td>
                <td>{r.submitted_at || r.revoked_at ? null : <InviteRowActions inviteId={r.id} canResend={r.listing_snapshots?.status === "approved"} />}</td>
              </tr>
            ))}
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted">No valuation requests yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {outbox.length ? (
        <Card>
          <h2 className="text-[17px] font-semibold">Recent emails (outbox)</h2>
          <p className="mt-1 text-sm text-muted">&quot;captured&quot; means sending is not configured yet (no RESEND_API_KEY / MAIL_FROM, or MAIL_CAPTURE=1); the email was recorded but not delivered.</p>
          <ul className="mt-2 divide-y divide-border text-sm">
            {outbox.map((m) => (
              <li key={m.id} className="py-2">
                <details>
                  <summary className="cursor-pointer">
                    {m.to_email} · {m.subject} · <span className="text-muted">{m.status} {fmtDate(m.created_at)}</span>
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{m.text_body}</pre>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card>
        <h2 className="text-[17px] font-semibold">Invite emails</h2>
        <p className="mt-1 text-sm text-muted">Adding an email lets that person past the waitlist. Existing accounts are flipped immediately.</p>
        <AddInviteForm />
      </Card>
      {waiting.length ? (
        <Card>
          <h2 className="text-[17px] font-semibold">Waiting ({waiting.length})</h2>
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
            <h2 className="text-[17px] font-semibold">
              Scoring mode: <span className={mode === "shadow" ? "text-accent-text" : "text-pos"}>{mode}</span>
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
            <dd className="figures text-[18px] font-bold">{approved ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Forecasts</dt>
            <dd className="figures text-[18px] font-bold">{forecasts ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Score evaluations</dt>
            <dd className="figures text-[18px] font-bold">{evals ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Last aggregate refresh</dt>
            <dd className="figures text-[18px] font-bold">{last ? new Date(last).toLocaleString("en-US", { timeZone: "UTC", hour12: false }) + " UTC" : "never"}</dd>
          </div>
        </dl>
      </Card>
      <p className="text-xs text-muted">A daily cron at 06:00 UTC calls /api/cron/recompute with the CRON_SECRET bearer token and does the same work.</p>
    </div>
  );
}

async function ForecastsTab() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("forecast_submissions")
    .select("id,user_id,snapshot_id,value,confidence,cap,current_score,raw_score,counts_toward_independent,voided_at,void_reason,information_level,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  type Row = { id: string; user_id: string; snapshot_id: string; value: number; confidence: "low" | "medium" | "high"; cap: number; current_score: number; raw_score: number; counts_toward_independent: boolean; voided_at: string | null; void_reason: string | null; information_level: string; created_at: string };
  const rows = (data ?? []) as Row[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const snapIds = [...new Set(rows.map((r) => r.snapshot_id))];
  const [{ data: pr }, { data: sn }] = await Promise.all([
    userIds.length ? admin.from("profiles").select("id,email").in("id", userIds) : Promise.resolve({ data: [] }),
    snapIds.length ? admin.from("listing_snapshots").select("id,headline,state").in("id", snapIds) : Promise.resolve({ data: [] }),
  ]);
  const emails = new Map<string, string>();
  for (const p of (pr ?? []) as Array<{ id: string; email: string }>) emails.set(p.id, p.email);
  const snaps = new Map<string, { headline: string; state: string | null }>();
  for (const x of (sn ?? []) as Array<{ id: string; headline: string; state: string | null }>) snaps.set(x.id, x);
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Member</th>
            <th>Listing</th>
            <th>Value</th>
            <th>Conf.</th>
            <th>Cap</th>
            <th>Score (raw)</th>
            <th>Counts</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.voided_at ? "opacity-60" : ""}>
              <td className="figures whitespace-nowrap text-muted">{fmtDate(r.created_at)}</td>
              <td>{emails.get(r.user_id) ?? r.user_id.slice(0, 8)}</td>
              <td>
                <Link href={`/value/${r.snapshot_id}`} className="hover:underline">
                  {snaps.get(r.snapshot_id)?.headline ?? "Listing"}
                </Link>
                {r.information_level === "cim" ? <span className="ml-1 text-xs text-accent-text">CIM</span> : null}
              </td>
              <td>
                <Money value={Number(r.value)} />
              </td>
              <td>{CONFIDENCE_LABEL[r.confidence]}</td>
              <td className="figures">±{Number(r.cap).toFixed(1)}</td>
              <td>
                <Points value={Number(r.current_score)} /> <span className="figures text-xs text-muted">({Number(r.raw_score).toFixed(2)})</span>
              </td>
              <td className="text-muted">{r.voided_at ? `voided: ${r.void_reason ?? ""}` : r.counts_toward_independent ? "yes" : "no (same org)"}</td>
              <td>{r.voided_at ? null : <VoidForecastButton forecastId={r.id} />}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="text-muted">
                No forecasts yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
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
