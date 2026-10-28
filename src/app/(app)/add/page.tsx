import { hasAcceptedTerms, requireMember } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { AddListingFlow } from "./AddListingFlow";

export const metadata = { title: "Add a listing" };

export default async function AddPage() {
  const { profile } = await requireMember();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add a listing"
        lede="Paste a broker listing for a business for sale. We check the source before fetching anything, pull the plain facts, and you get the first valuation, where the most points are at stake."
      />
      <AddListingFlow needsTerms={!hasAcceptedTerms(profile)} />
    </div>
  );
}
