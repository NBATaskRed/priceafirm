import { cookies } from "next/headers";
import { requireMember } from "@/lib/auth/session";
import { DEALS_GATE_COOKIE } from "@/lib/discovery/gate";
import { PageHeader } from "@/components/ui";
import { DealSearch } from "./DealSearch";

export const metadata = { title: "Find Deals" };

export default async function DealsPage() {
  await requireMember();
  const jar = await cookies();
  const gateConfirmed = jar.get(DEALS_GATE_COOKIE)?.value === "1";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Find deals"
        lede="Describe what you are looking for in plain language. Results show the listing, the crowd's model-derived view and how many independent valuations it rests on."
      />
      <DealSearch gateConfirmed={gateConfirmed} />
    </div>
  );
}
