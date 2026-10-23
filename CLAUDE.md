# PriceAFirm

Crowd valuation and deal-discovery network for businesses listed for sale. Owner: Ashish Bhatt
(Next Bridge Advisors). Spec of record: `docs/DESIGN.md`. Current state and next work: `docs/HANDOFF.md`.
Read both before changing behaviour.

## Stack
Next.js 16 (App Router, TS strict, Tailwind v4) on Vercel (project `priceafirm`, team next-bridge-advisors),
Supabase (Postgres + magic-link auth), Node 24. Same stack as fundstamp.com.

## Commands
- `npm run dev` / `npm run build` / `npm run lint` / `npx tsc --noEmit`
- `npx vitest run` (engine, URL handling, extraction, search; must stay green)
- `npx tsx src/lib/quant/simulate.ts 300` (scoring simulation; honest experts must beat copycats and overconfident-wrong)
- DB check on plain Postgres: `psql -f supabase/tests/stub_auth.sql && psql --single-transaction -f supabase/migrations/0001_schema.sql && psql -f supabase/seed.sql && psql -At -f supabase/tests/smoke.sql`
- CI (`.github/workflows/ci.yml`) runs all of the above on every push.

## Layout
- `supabase/migrations/0001_schema.sql` single consolidated schema. Add new changes as `0002_*.sql`, never edit 0001 after it is deployed.
- `src/lib/quant/model.ts` pure engine; `service.ts` I/O; `simulate.ts` harness.
- `src/lib/sources/` URL normalize, excluded-source check, SSRF-safe fetch, facts-only extraction.
- `src/lib/search/` natural-language search -> filter chips -> deterministic filters.
- `src/lib/actions/` server actions; `src/lib/auth/session.ts` gating; `src/app/` screens.
- `src/lib/invites/` valuation requests (API `POST /api/invites`, contract in `docs/INVITE_API.md`), auto-login route `src/app/invite/[token]`; `src/lib/mail/` templates + Resend/outbox sender.

## Invariants (do not break)
- Money paths live in SQL RPCs (`reveal_url`, `submit_forecast`, `post_score_change`, `void_forecast`, `remove_source`). Never move charging or counting into app code.
- Reveal costs 1 point iff `independent_count >= 3` at reveal time and the user did not submit the URL; free otherwise; never recharge.
- `independent_count` changes only inside `submit_forecast` / `void_forecast`, once per org cluster. Show it next to every crowd figure.
- Find Deals writes a `find_deals_row` exposure for every row BEFORE returning it. Value Businesses never shows or orders by crowd figures.
- Cap is `10/sqrt(1+n_eff_before)`, identical across confidence. Scoring is the quadratic (L2) proper score vs F_before, mapped affinely by a choice-independent normalizer (no clipping, plain mean). The "exact incentive compatibility" tests (honest width, honest center, L2 identity, bound) must pass after any change.
- Ask is always EV. No ask-basis field. BizBuySell/BizQuest are excluded before any fetch.
- Invite tokens are stored only as sha256 hashes; the outbox stores emails with sign-in links redacted. Listings in requests are identified by URL and onboarded first when new.
- Crowd numbers are "model-derived, not offers". Scores are "peer-predictive", never "accuracy".

## Conventions
- No em dashes in user-facing copy. Points show one decimal; ledger keeps four.
- Commit small, keep tests green, update `docs/HANDOFF.md` when you finish a chunk.

## UI and UX: design is being finished separately (do not diverge)
- The visual and interaction design is being finished on a Claude Design canvas ("PriceAFirm UX"), outside
  this repo. When it is final, it arrives here as `docs/UX_SPEC.md` (tokens, screens, copy) and becomes the
  source of truth for look and feel.
- Until then: do NOT restyle, re-layout or rewrite user-facing copy on any screen, and do not add new screens'
  visual treatments. Functional fixes (bugs, data, validation, accessibility defects) are fine; keep the
  existing components and classes.
- New behaviour that needs UI: add it with the existing components and minimal styling, and list it under
  "UI added pending design" in docs/HANDOFF.md so the design pass can cover it.
- Product rules the design already assumes (keep them): one EV number plus Low/Medium/High; possible score
  is one +/- range for all three levels; the assumed range per confidence is shown; live implied multiple;
  "Independent valuations on file: N" on neutral screens and "Based on N independent valuations" next to
  every crowd figure; reveal free below 3 valuations, 1 point at 3+ (the buyer's own valuation counts);
  Find Deals rows are identifiable and exposed on render, behind a once-per-session gate.
