import { requireMember } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, balance, admin } = await requireMember();
  return (
    <AppShell balance={balance} email={user.email} admin={admin}>
      {children}
    </AppShell>
  );
}
