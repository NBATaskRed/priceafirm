import { requireMember } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { SetPasswordForm } from "./SetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

export default async function AccountPage() {
  const { user, profile } = await requireMember();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Account" lede={<>Signed in as <span className="text-text">{user.email}</span>.</>} />
      <Card>
        <h2 className="text-base font-semibold">{profile.password_set ? "Change password" : "Set a password (optional)"}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          You can always sign in with a one-time link sent to this email. A password lets you sign in without checking your inbox.
        </p>
        <SetPasswordForm hasPassword={profile.password_set} />
      </Card>
    </div>
  );
}
