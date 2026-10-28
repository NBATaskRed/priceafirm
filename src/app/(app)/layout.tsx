import { cookies } from "next/headers";
import { requireMember } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, balance, admin } = await requireMember();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <AppShell balance={balance} email={user.email} admin={admin} theme={theme}>
      {children}
    </AppShell>
  );
}
