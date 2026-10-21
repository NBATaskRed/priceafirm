import { hasAcceptedTerms, requireMember } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { AddListingFlow } from "./AddListingFlow";

export const metadata = { title: "Add a Listing" };

export default async function AddPage() {
  const { profile } = await requireMember();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add a listing"
        lede="Paste the URL of a business for sale on a cleared source. We check the source before fetching anything, pull the neutral facts, and offer you the first valuation. Submitting a URL alone earns nothing; the valuation is what earns points."
      />
      <AddListingFlow needsTerms={!hasAcceptedTerms(profile)} />
    </div>
  );
}
