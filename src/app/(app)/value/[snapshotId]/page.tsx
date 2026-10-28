import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasAcceptedTerms, requireMember } from "@/lib/auth/session";
import { loadQuestion } from "@/lib/discovery/question";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isExposed } from "@/lib/discovery/listings";
import { nwcConvention } from "@/lib/domain/types";
import { ValuationForm } from "@/components/ValuationForm";
import { FactTiles, Notice, fmtDate, othersValuedText, placeText } from "@/components/ui";

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
    <div className="mx-auto flex max-w-[560px] flex-col gap-[18px]">
      {welcome ? (
        <Notice tone="info" title={`Welcome${profile.display_name ? `, ${profile.display_name.split(/\s+/)[0]}` : ""}`}>
          One number and how sure you are. Under a minute. Your number stays private; other buyers only see the combined view. You start with 3 points.{" "}
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

      <section className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.015em]">{s.headline}</h1>
        <p className="text-[15px] text-muted">
          {placeText(s)} · {s.industry}
        </p>
        <FactTiles snapshot={s} className="mt-2.5" />
        <p className="mt-1 text-[13px] text-muted">{othersValuedText(q.nInd)}</p>
      </section>

      {exposed ? (
        <Notice tone="warn" title="You've seen what buyers think of this one, so valuing it can't earn points">
          You saw this listing in Find deals. Valuing stays blind, so it no longer counts for you. You can still value other businesses.{" "}
          <Link href="/value" className="underline">
            Value businesses
          </Link>
          .
        </Notice>
      ) : (
        <ValuationForm
          snapshotId={s.id}
          contractToken={q.contractToken}
          cap={q.cap}
          nInd={q.nInd}
          ask={s.asking_price}
          earnings={s.earnings}
          earningsType={s.earnings_type}
          needsTerms={!hasAcceptedTerms(profile)}
        />
      )}

      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center text-muted hover:text-text">What your number should cover</summary>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-text-soft">
          <li>Enterprise value: cash-free and debt-free. Ignore the seller&apos;s cash and the seller&apos;s debt.</li>
          <li>
            Working capital:{" "}
            {nwc === "included"
              ? "included in your value (earnings are at or above $1M, or the listing says so)."
              : nwc === "excluded"
                ? "excluded from your value (earnings are below $1M, or the listing says so)."
                : "unresolved for this listing because earnings are unknown; value the business as you normally would and note any assumption."}
          </li>
          <li>Inventory: {s.includes_inventory == null ? "not stated." : s.includes_inventory ? "included in the deal as listed." : "not included as listed."}</li>
          <li>Real estate: {s.includes_real_estate == null ? "not stated." : s.includes_real_estate ? "included in the deal as listed; include it in your value." : "not included; value the operating business only."}</li>
          <li>The asking price is treated as an enterprise value ask.</li>
          <li>
            Listing facts as of <span className="figures">{fmtDate(s.snapshot_date)}</span>. We assume they haven&apos;t changed since; that is a modeling convention, not a guarantee.
          </li>
        </ul>
      </details>
    </div>
  );
}
