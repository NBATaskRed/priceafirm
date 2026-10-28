import { cookies } from "next/headers";
import { requireMember } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { SetPasswordForm } from "./SetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

export default async function AccountPage() {
  const { user, profile } = await requireMember();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Account" lede={<>Signed in as <span className="text-text">{user.email}</span>.</>} />
      <Card className="mb-4">
        <h2 className="text-[17px] font-semibold">Theme</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Light is the default. Your choice is remembered on this device.</p>
        <ThemeToggle initial={theme} />
      </Card>
      <Card>
        <h2 className="text-[17px] font-semibold">{profile.password_set ? "Change password" : "Set a password (optional)"}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          You can always sign in with a one-time link sent to this email. A password lets you sign in without checking your inbox.
        </p>
        <SetPasswordForm hasPassword={profile.password_set} />
      </Card>
    </div>
  );
}
