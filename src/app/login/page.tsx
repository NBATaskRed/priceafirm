import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("/") || v.startsWith("//")) return "/value";
  return v;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const user = await getSessionUser();
  if (user) redirect(next);
  const error = typeof sp.error === "string" ? sp.error : null;
  const ERRORS: Record<string, string> = {
    callback: "That sign-in link did not work. It may have expired; request a new one.",
    invite_expired: "That valuation link has expired. Enter your email below and we will send a fresh sign-in link.",
    invite_invalid: "That valuation link is not valid anymore. Sign in with your email to continue.",
    invite_failed: "We could not sign you in from that link. Enter your email below for a fresh sign-in link.",
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex min-h-14 w-full max-w-[1160px] items-center px-5 py-3 md:px-6">
        <Link href="/" aria-label="PriceAFirm home">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-24">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] md:text-[36px]">Sign in</h1>
        <p className="mt-2 text-[15px] text-text-soft">Use a one-time link sent to your email, or your password if you have set one.</p>
        <div className="card card-pad mt-6">
          <LoginForm next={next} initialError={error ? (ERRORS[error] ?? null) : null} />
        </div>
        <p className="mt-4 text-[13px] text-muted">
          PriceAFirm is an invited pilot. Signing in creates an account; if your email is not on the invite list you will see a waitlist page. By continuing
          you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy</Link> notes.
        </p>
      </main>
    </div>
  );
}
