import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Logo } from "@/components/Logo";
import { ButtonLink, ScoreRange } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const user = await getSessionUser();
  if (user) redirect("/value");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20">
        <section className="grid gap-10 pt-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-20">
          <div className="max-w-xl">
            <h1 className="text-[2.1rem] leading-[1.08] sm:text-[2.75rem]">Find businesses other buyers may undervalue. Share your opinion to unlock more deals.</h1>
            <p className="mt-5 max-w-lg text-[1.05rem] text-muted">
              PriceAFirm pools independent, confidence-labeled valuations of businesses already listed for sale. You contribute a blind estimate, earn a
              signed point balance as later opinions arrive, and spend points to reveal the original listings behind the opportunities you like.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/login" size="lg">
                Sign in with email
              </ButtonLink>
              <span className="text-sm text-muted">Invited pilot. New accounts start with 3.0 points.</span>
            </div>
          </div>

          {/* The one bold element: a worked example of the reward contract, not a stat tile. */}
          <aside className="card self-start p-5 sm:p-6" aria-label="How a valuation is scored">
            <p className="text-sm text-muted">One listing snapshot</p>
            <p className="mt-1 text-lg font-semibold">HVAC services</p>
            <p className="text-sm text-muted">Mechanical contracting · Southeast US · FL · Tampa Bay</p>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Ask</dt>
                <dd className="figures text-base">$2.9M</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Revenue</dt>
                <dd className="figures text-base">$3.2M</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">SDE</dt>
                <dd className="figures text-base">$680K</dd>
              </div>
            </dl>
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-sm font-medium">What do you think this business is worth?</p>
              <p className="mt-1 text-xs text-muted">Cash-free, debt-free enterprise value. One number plus your confidence.</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-center justify-between gap-3">
                  <span>Possible score, any confidence</span>
                  <ScoreRange cap={10} />
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span>High confidence, $2.9M estimate</span>
                  <span className="figures text-muted">assumes $2.2M to $3.8M</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span>Low confidence, $2.9M estimate</span>
                  <span className="figures text-muted">assumes $1.4M to $5.9M</span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-muted">
                The possible score is the same for every confidence level and shrinks as more independent opinions arrive. Confidence sets how sharply later
                opinions move your score, in either direction.
              </p>
            </div>
          </aside>
        </section>

        <section className="mt-20 grid gap-8 border-t border-border pt-12 md:grid-cols-3" aria-label="How it works">
          <Step n={1} title="Value a business blind">
            See only neutral listing facts: industry, location, ask, revenue and earnings. Submit one enterprise value estimate with Low, Medium or High
            confidence. Your possible score range is frozen the moment you submit.
          </Step>
          <Step n={2} title="Your balance moves as others weigh in">
            Each later independent valuation re-scores yours against how well it predicted the crowd. Scores can go up or down. Your balance may rise or
            fall as additional independent opinions arrive.
          </Step>
          <Step n={3} title="Spend points on deals you want">
            Search in plain language and read the model-derived crowd view on every result. Reveal the source URL free while a listing has fewer than 3
            valuations, 1 point from 3 on. Any listing you see in Find Deals can no longer earn you points.
          </Step>
        </section>

        <section className="mt-16 max-w-2xl text-sm text-muted">
          <p>
            Crowd figures are model-derived, not offers or observed prices. Scores measure agreement with later independent opinions, not verified
            accuracy. Points are not cash and carry no monetary value. Listings come only from sources that have cleared a rights review.
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted">
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
      <span className="figures mt-0.5 inline-grid h-7 w-7 flex-none place-content-center rounded-full border border-border-strong text-sm font-semibold" aria-hidden="true">
        {n}
      </span>
      <div>
        <h2 className="text-base font-semibold">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}
