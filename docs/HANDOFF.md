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
