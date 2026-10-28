import { cookies } from "next/headers";
import { requireMember } from "@/lib/auth/session";
import { DEALS_GATE_COOKIE } from "@/lib/discovery/gate";
import { DealSearch } from "./DealSearch";

export const metadata = { title: "Find deals" };

export default async function DealsPage() {
  await requireMember();
  const jar = await cookies();
  const gateConfirmed = jar.get(DEALS_GATE_COOKIE)?.value === "1";
  return <DealSearch gateConfirmed={gateConfirmed} />;
}
