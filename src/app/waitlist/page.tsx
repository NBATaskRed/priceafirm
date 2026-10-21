import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, getSessionUser, inviteOnly, isAdmin } from "@/lib/auth/session";
import { signOutAction } from "@/lib/actions/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Waitlist" };

export default async function WaitlistPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  if (!inviteOnly() || isAdmin(user.email) || profile?.invited || profile?.role === "admin") redirect("/value");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center px-4">
        <Link href="/" aria-label="PriceAFirm home">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-24">
        <h1 className="text-2xl">PriceAFirm is an invited pilot</h1>
        <p className="mt-3 text-[15px] text-muted">
          You are signed in as <span className="text-text">{user.email}</span>, but that address is not on the invite list yet. Your account is saved; when an
          invite is added you will be able to sign in and start valuing businesses right away.
        </p>
        <p className="mt-3 text-sm text-muted">If you were expecting access, reply to the person who invited you with this email address.</p>
        <form action={signOutAction} className="mt-6">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </main>
    </div>
  );
}
