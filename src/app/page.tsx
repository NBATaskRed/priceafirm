import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Logo } from "@/components/Logo";
import { ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const user = await getSessionUser();
  if (user) redirect("/value");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex min-h-14 w-full max-w-[1160px] items-center justify-between px-5 py-3 md:px-6">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/terms" className="nav-link">
            Terms
          </Link>
          <Link href="/privacy" className="nav-link">
            Privacy
          </Link>
          <ButtonLink href="/login" variant="secondary" size="sm" className="ml-2">
            Sign in
          </ButtonLink>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1160px] flex-1 px-5 pb-20 md:px-6">
        <section className="grid gap-10 pt-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-20">
          <div className="max-w-xl">
            <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[44px]">Find businesses other buyers may undervalue. Share your opinion to unlock more deals.</h1>
            <p className="mt-5 max-w-lg text-[17px] text-text-soft">
              Say what businesses already listed for sale are worth, one number and how sure you are. Earn points when later buyers land near you, and spend
              them to see the broker listings behind the deals you like.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/login" size="lg">
                Sign in with email
              </ButtonLink>
              <span className="text-sm text-muted">Invited pilot. New accounts start with <span className="figures">3.0</span> points.</span>
            </div>
          </div>

          {/* The one bold element: a worked example of the reward contract, not a stat tile. */}
          <aside className="card self-start p-5 sm:p-6" aria-label="How a valuation is scored">
            <p className="text-sm text-muted">One listing snapshot</p>
            <p className="mt-1 text-[19px] font-bold">HVAC services</p>
            <p className="text-sm text-muted">Tampa Bay, FL · Mechanical contracting</p>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="tile-label">Asking</dt>
                <dd className="figures text-[18px] font-bold">$2.9M</dd>
              </div>
              <div>
                <dt className="tile-label">Revenue</dt>
                <dd className="figures text-[18px] font-bold">$3.2M</dd>
              </div>
              <div>
                <dt className="tile-label">SDE</dt>
                <dd className="figures text-[18px] font-bold">$680K</dd>
              </div>
            </dl>
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-[17px] font-semibold">What do you think it&apos;s worth?</p>
              <p className="mt-1 text-[13px] text-muted">Cash-free, debt-free enterprise value. One number and how sure you are.</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-center justify-between gap-3">
                  <span>Points at stake, however sure you are</span>
                  <span className="figures font-bold">&plusmn;10.0</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span>High, $2.9M</span>
                  <span className="text-muted">we assume roughly <span className="figures">$2.2M to $3.8M</span></span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span>Low, $2.9M</span>
                  <span className="text-muted">we assume roughly <span className="figures">$1.4M to $5.9M</span></span>
                </li>
              </ul>
              <p className="mt-3 text-[13px] text-muted">
                Points at stake are the same however sure you are, and shrink as more buyers value the business. How sure you are sets how sharply later
                valuations move your score, in either direction.
              </p>
            </div>
          </aside>
        </section>

        <section className="mt-20 grid gap-8 border-t border-border pt-12 md:grid-cols-3" aria-label="How it works">
          <Step n={1} title="Value a business blind">
            See only the plain listing facts: industry, location, asking price, revenue and earnings. Give one number and say how sure you are: Low, Medium
            or High. Points at stake are fixed the moment you lock in.
          </Step>
          <Step n={2} title="Your score moves as other buyers weigh in">
            Each later valuation moves your score: up when buyers land near you, down when they don&apos;t. Your balance can rise or fall as more buyers
            value the business.
          </Step>
          <Step n={3} title="Spend points on deals you want">
            Search in plain language and see what buyers think of every result. Seeing the broker listing is free while a listing has fewer than 3
            valuations, 1 point from 3 on. Any listing you see in Find deals can no longer earn you points.
          </Step>
        </section>

        <section className="mt-16 max-w-2xl text-sm text-muted">
          <p>
            What buyers think is a model estimate from their valuations, not an offer or an observed price. Your score is peer-predictive: it measures
            how close you land to later buyers. Points are not cash and carry no monetary value. Listings come only from sources that have cleared a rights review.
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-3 px-5 py-5 text-[13px] text-muted md:px-6">
          <span>PriceAFirm, an invited pilot.</span>
          <span className="flex gap-4">
            <Link href="/terms" className="hover:text-text">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-text">
              Privacy
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="figures mt-0.5 inline-grid h-7 w-7 flex-none place-content-center rounded-full bg-accent-soft text-sm font-bold text-accent-text" aria-hidden="true">
        {n}
      </span>
      <div>
        <h2 className="text-[17px] font-semibold">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}
