import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasAcceptedTerms, requireMember } from "@/lib/auth/session";
import { loadQuestion } from "@/lib/discovery/question";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isExposed } from "@/lib/discovery/listings";
import { nwcConvention } from "@/lib/domain/types";
import { ValuationForm } from "@/components/ValuationForm";
import { Card, FactsGrid, Notice, ScoreRange, fmtDate, locationText, valuationsText } from "@/components/ui";

export const metadata = { title: "Value this business" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ValueDetailPage({ params, searchParams }: PageProps<"/value/[snapshotId]">) {
  const { snapshotId } = await params;
  const welcome = (await searchParams).welcome === "1";
  if (!UUID.test(snapshotId)) notFound();
  const { user, profile } = await requireMember();

  const q = await loadQuestion(snapshotId);
  if (!q) notFound();
  const s = q.snapshot;

  const admin = supabaseAdmin();
  const [{ data: mine }, exposed] = await Promise.all([
    admin.from("forecast_submissions").select("id").eq("user_id", user.id).eq("business_id", s.business_id).maybeSingle(),
    isExposed(user.id, s.business_id),
  ]);
  if (mine) redirect(`/value/${snapshotId}/done`);

  const nwc = nwcConvention(s);

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/value" className="hover:text-text">
          Value businesses
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{s.headline}</span>
      </nav>

      {welcome ? (
        <Notice tone="info" title={`Welcome${profile.display_name ? `, ${profile.display_name.split(/\s+/)[0]}` : ""}`} className="mb-6">
          You have had the materials on this business for a little while. Tell us what you think it is worth: one number and your confidence. Your
          valuation is private; others only see aggregate figures. Your account is ready, and you start with 3 points.{" "}
          {profile.password_set ? null : (
            <>
              To sign in later, use an emailed link or{" "}
              <Link href="/account" className="underline">
                set a password
              </Link>
              .
            </>
          )}
        </Notice>
      ) : null}

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl">{s.headline}</h1>
        <p className="mt-1 text-muted">
          {s.industry} · {locationText(s)}
        </p>
        <p className="mt-1 text-sm text-muted">
          Snapshot <span className="figures">{fmtDate(s.snapshot_date)}</span> · {valuationsText(q.nInd)} on file · possible score <ScoreRange cap={q.cap} />
        </p>
      </header>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Listing facts</h2>
        <FactsGrid snapshot={s} />
      </Card>

      <Card className="mb-6">
        <h2 className="text-lg font-semibold">What do you think this business is worth?</h2>
        <p className="mt-1 text-sm text-muted">
          Give your central estimate of the cash-free, debt-free enterprise value of this business as described in the snapshot above, in US dollars.
        </p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted hover:text-text">Valuation assumptions</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-text/90">
            <li>Enterprise value: cash-free and debt-free. Ignore the seller&apos;s cash and the seller&apos;s debt.</li>
            <li>
              Working capital:{" "}
              {nwc === "included"
                ? "included in your value (earnings are at or above $1M, or the listing says so)."
                : nwc === "excluded"
                  ? "excluded from your value (earnings are below $1M, or the listing says so)."
                  : "unresolved for this listing because earnings are unknown; value the business as you would normally and note any assumption in Why."}
            </li>
            <li>Inventory: {s.includes_inventory == null ? "not stated." : s.includes_inventory ? "included in the deal as listed." : "not included as listed."}</li>
            <li>Real estate: {s.includes_real_estate == null ? "not stated." : s.includes_real_estate ? "included in the deal as listed; include it in your value." : "not included; value the operating business only."}</li>
            <li>The asking price is treated as an enterprise value ask.</li>
            <li>We assume the listing facts and ask have not changed since this snapshot; that is a modeling convention, not a guarantee.</li>
          </ul>
        </details>
      </Card>

      {exposed ? (
        <Notice tone="warn" title="You saw this listing in Find deals, so a scored valuation isn't available">
          Once you have seen crowd valuations for a business, a blind valuation of it can no longer be scored. You can still value other
          businesses.{" "}
          <Link href="/value" className="underline">
            Back to the queue
          </Link>
          .
        </Notice>
      ) : (
        <Card>
          <ValuationForm snapshotId={s.id} contractToken={q.contractToken} cap={q.cap} nInd={q.nInd} earnings={s.earnings} earningsType={s.earnings_type} needsTerms={!hasAcceptedTerms(profile)} />
        </Card>
      )}
    </div>
  );
}
