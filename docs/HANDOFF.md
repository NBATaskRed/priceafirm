# Handoff: PriceAFirm build state (Oct 21, 2026)

Spec of record: `docs/DESIGN.md`. Working rules for agents: `CLAUDE.md`.

## Done and verified
- **Schema** `supabase/migrations/0001_schema.sql` (single consolidated v2.2 file). Verified on Postgres 16:
  migration + seed apply in one transaction, and `supabase/tests/smoke.sql` passes: 3-point grant, free reveal
  below 3 valuations, 1-point reveal at 3+, free reopen, exposure blocks scoring, org cluster counts once,
  duplicate submission rejected, score delta posts exactly once per trigger, void decrements the count,
  removed source blocks reveals. CI runs the same check.
  - RPCs: `reveal_url`, `submit_forecast`, `post_score_change`, `void_forecast`, `remove_source`,
    `is_exposed`, `source_is_live`, `record_exposure`, `point_balance`; signup trigger creates the profile
    and the 3-point grant.
- **Engine** `src/lib/quant/model.ts`: model prior blended with ask (PLACEHOLDER multiple table, version
  `multiples-v0-placeholder`), opinion pool with n_ind / n_eff, cap 10/sqrt(1+m), proper log score vs
  F_before, d0 = 2.0, zRef = 1.5 (zRef below 1.5 breaks honest-confidence optimality), newcomer floor.
  `service.ts` seals, recomputes with the floor, refreshes aggregates and skill. `simulate.ts` harness.
- **Ingestion and search** `src/lib/sources`, `src/lib/search`: excluded list only (BizBuySell/BizQuest),
  SSRF-safe fetch, facts-only extraction, dedupe, NL search parsing with deterministic filters.
- **App** (all screens in design Section 14): Value queue, valuation form (±cap, assumed range, implied
  multiple, count), post-submission with crowd figure + reveal, Find Deals (session gate, identifiable rows,
  exposure written before return, pages of 10, min-valuations filter), Add a Listing, My Points (floor
  status, percentile), My Unlocked, Admin (sources/complaints/removal, review queue, invites, scoring,
  void forecast, audit), `/api/cron/recompute` + `vercel.json` daily cron.
- Checks: `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (73 tests) all green.
- **Vercel** project `priceafirm` (prj_03QUn7VjLqFo4nlXDshN4SyMUrKU, team next-bridge-advisors), Node 24.
  Env already set: SESSION_SECRET, CRON_SECRET, ADMIN_EMAILS, INVITE_ONLY=1, SCORING_MODE=shadow, APP_URL.

## UX spec v1.1 implemented (Oct 28, 2026)
- All screens follow `docs/UX_SPEC.md` v1.1: light default, dark via the `paf_theme` cookie (account menu and
  Account page). Tokens only in components; shared classes in `globals.css` (`.btn-primary/-invert/-secondary`,
  `.tile`, `.points-chip`, `.seg`, `.pill`, `.ev-wrap`, `.band-*`, `.seal`).
- New `src/components/ValueBand.tsx` (form band and the locked-in buyers' band). `ConfidencePicker` is a pill
  radiogroup with live copy; `EvInput` in `MoneyInput.tsx`; `StakeTile` in `ValuationForm.tsx`.
- Email (`src/lib/mail/templates.ts`) has the spec 4.1 copy and an optional fact strip; `sendInviteEmail`
  passes facts, metro and the source publisher as the broker name.
- Kept, quietly styled, though the drawings omit them: the private note ("Add a private note"), the
  valuation assumptions disclosure, Find deals "Valuations at least" filter and example queries, the
  "Your valuations" list on My points.

## Automated valuation requests (added Oct 22, design v2.3 Section 13)
- `POST /api/invites` (bearer INVITE_API_SECRET, already set in Vercel): buyer name, email, listing URL ->
  onboard URL if new (held for Admin > Review when facts are incomplete; approval sends held emails) ->
  create/reuse account -> eligibility -> email with `/invite/<token>` link. Contract: `docs/INVITE_API.md`.
- `/invite/<token>`: 30-day reusable auto-login (generateLink + verifyOtp server-side), lands on
  `/value/<snapshot>?welcome=1`. Forecasts from invited buyers are tagged `cim` and mark the invite submitted.
- Sign-in page: email link or password; `/account` sets a password. Admin > Invites: manual send, request log
  with resend/revoke, outbox. Admin > Review: edit facts.
- Not verified against a live Supabase yet (no project). First live test: call the API with your own email.

## Remaining, in order
1. **Supabase project** (needs the owner): create `priceafirm`, then from a machine with the Supabase CLI:
   `supabase link --project-ref <ref>` -> `supabase db push` -> run `supabase/seed.sql` in the SQL editor.
   Auth: enable Email (magic link), Site URL = APP_URL, redirect `<APP_URL>/auth/callback`.
   Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY to Vercel
   (production + preview).
2. **Vercel <-> GitHub**: connect the project to the repo, deploy, then sign in with an ADMIN_EMAILS address
   and walk the Section 18 acceptance list on the live site.
3. **Email**: Resend account + verified sending domain, then RESEND_API_KEY and MAIL_FROM in Vercel. In
   Supabase Auth set custom SMTP (Resend) so email sign-in links are not limited to the default 2/hour.
   Point the buyer-qualification system (Make.com HTTP module) at `/api/invites` per `docs/INVITE_API.md`.
4. **Operator catalog**: load the real NBA/Synergy listings (replace the 5 fictional seed rows). An admin
   "Add operator listing" form or a CSV import is the fastest route.
5. **Multiple table**: replace `MULTIPLE_TABLE` in `src/lib/quant/model.ts` with Ashish's deal-history
   multiples; bump `MULTIPLE_TABLE_VERSION`; rerun tests.
6. **Before live points**: review shadow scores from the pilot, rerun the simulation, then set
   SCORING_MODE=live in Vercel.
7. Nice to have: robots.txt check and per-domain rate limit in `safeFetch`, e2e tests (Playwright is
   preinstalled in cloud sessions), remove the deprecated `SourceRights` alias.

## Paused Oct 22 (work in progress)
- Scoring switched to the quadratic proper score (SCORING_VERSION quadratic-v3). Reason: the clipped log score
  rewarded shading a valuation about 18% toward the crowd when the buyer's view was far from it. New engine
  tests prove honest width, honest center, the exact L2 identity and |score| <= cap; all 17 pass.
- Fixed: ledger postings keyed per evaluation (untriggered recomputes could post only once); newcomer floor
  spillover to the buyer's other first-5 forecasts is now posted.
- Verified Oct 28: DB smoke test (incl. repeat recompute and score = sum of deltas), 82 tests, typecheck, build, simulation all pass.
- Design canvas "PriceAFirm UX": all five screens done (Oct 28). Written up as docs/UX_SPEC.md, DRAFT pending
  owner approval; once approved, implement it across all screens (fonts Hanken Grotesk + Archivo wide).
- Design doc Section 6.3 rewritten for the quadratic rule (Oct 28).

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

## Status Oct 28 (paused)
- UX spec v1.1 APPROVED (light default, dark option; Hanken Grotesk + Archivo wide; wording and valuation form approved).
- All screens and the valuation request email restyled to the spec (commit 32f5b09); tsc, lint, 83 tests, build green.
- Not yet checked by eye in a browser (needs a live Supabase to sign in). First task on resume: screenshot every screen
  in light and dark and fix visual issues against docs/UX_SPEC.md and the "PriceAFirm UX" canvas.
- Known small deviations kept on purpose: no confidence level preselected; private note, valuation assumptions,
  Find deals valuation-count filter and example searches, and the My points valuations list are kept, styled quietly.

## Open questions for Claude
(ChatGPT/Codex: add questions here instead of changing scoring, points or design. Claude answers in batches.)
- none yet

## UI added pending design
- none yet

## Session log
- 2026-10-28 (Claude): approved UX spec implemented; AGENTS.md, docs/design/, WORKFLOW.md and DECISIONS.md added for the two-tool split. Next: owner setup (GitHub, Supabase, Vercel keys, Resend), then ChatGPT does the visual check of every screen in both themes.
