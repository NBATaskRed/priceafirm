# Handoff: PriceAFirm build state (Oct 21, 2026)

Spec of record: the project doc `claude/PriceAFirm_Product_Design_v2.2.md` (v2.2). `docs/BUILD_BRIEF.md`
was written against v2.0 + one amendment and is now partly stale; where they disagree, v2.2 wins.

## Done and verified (v2.2)
- `supabase/migrations/0001_schema.sql` (v2.0 base) + `0002_v2_2.sql` (v2.2 deltas). Nothing is deployed
  yet, so consolidate these into one migration before the first `db push` (keep the behaviour, drop the
  `drop column`/`alter type` churn). `seed.sql` already matches v2.2.
  - RPCs: `reveal_url` (free below 3 valuations, 1 point at 3+, self-submitted free, 20 free/day rate limit,
    statuses: charged | free | self_submitted | already_unlocked | insufficient | rate_limited | removed |
    no_url | not_found; returns count), `submit_forecast` (cap-only contract, increments
    `independent_count` once per org cluster in the same transaction, statuses sealed | exposed |
    already_submitted | snapshot_not_approved | removed | rate_limited), `post_score_change` (raw + floored
    score, exactly-once ledger delta per forecast x trigger), `void_forecast`, `remove_source`,
    `is_exposed` (includes `find_deals_row`), `source_is_live`.
  - Tables added/changed: `listing_snapshots.independent_count`, `forecast_submissions.cap /
    information_level / counts_toward_independent / voided_at / raw_score`, `profiles.first5_floor_clipped`,
    `url_unlocks.count_at_unlock`, `listing_invites`, `source_domains` now has source_type + complaint/
    removal fields (no permission flags), ledger kind `URL_REVEAL_FREE`, exposure surface `find_deals_row`.
- `src/lib/quant/model.ts` (pure, 14 tests passing): model prior blended with ask (placeholder multiple
  table `MULTIPLE_TABLE`, version `multiples-v0-placeholder`; replace with the operator table in Stage 0),
  opinion pool with n_ind / n_eff, cap C(m) = 10/sqrt(1+m) identical across confidence, proper log score
  of the user's smoothed kernel vs F_before, clip d0 = 2.0, linear map z/zRef with zRef = 1.5 (chosen by
  scan: zRef < 1.5 breaks honest-confidence optimality), newcomer floor `applyNewcomerFloor`,
  `assumedRange`, `evidenceLabel` (none | single | preliminary | established).
- `src/lib/quant/service.ts`: `valuationQuestion` -> { snapshot, mBefore, nInd, cap, contractToken };
  `sealForecast` (returns cap + nInd; `bounds_changed` when coverage moved while the form was open);
  `recomputeSnapshot` applies the first-5 floor per user before posting; `refreshAggregate` writes
  `aggregation_cache.stats` (includes nInd) + attractiveness; `recomputeSkill` (score / cap, shrinkage).
- `src/lib/quant/simulate.ts`: honest experts > copycats > noisy > overconfident-wrong > contrarian-wrong.
- `src/lib/sources/**`, `src/lib/search/**`: built and tested (59 tests) against v2.0; a follow-up to
  adapt them to v2.2 (no allowlist, no ask_basis) was requested from the builder agent; confirm with
  `npx vitest run` and `npx tsc --noEmit`.
- Vercel project `priceafirm` created in team next-bridge-advisors (prj_03QUn7VjLqFo4nlXDshN4SyMUrKU),
  Node 24, env vars set: SESSION_SECRET, CRON_SECRET, ADMIN_EMAILS, INVITE_ONLY=1, SCORING_MODE=shadow,
  APP_URL. Still needed: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
  (no Supabase project exists yet; the Supabase MCP connector in this chat only exposes
  create_edge_function_secret, so the project must be created in the Supabase dashboard or with more
  MCP tools enabled), and a Git repo (NBATaskRed/priceafirm does not exist; the session GitHub token
  cannot create repos).

## Remaining for v2.2 (UI layer, mostly in src/app, src/components, src/lib/actions)
The UI builder agent was launched against v2.0 and then messaged with the v2.2 list below. Verify each:
1. Find Deals: identifiable rows, exposure (`find_deals_row`) written for every returned row BEFORE
   returning, 10 per page, once-per-session gate, min-valuations filter, 0-count rows ranked by fit only.
   Remove opaque slots / preview route / discovery tokens.
2. Reveal button copy and free/paid logic from `revealCost(independent_count)`; reveal available on the
   post-submission page with the crowd figure and "Based on N independent valuations".
3. Valuation form: single possible score ±cap, assumed range per confidence (`assumedRange`), live
   implied multiple (`impliedMultiple`), "Independent valuations on file: N"; Value queue "Valuations"
   column and sort by fewest valuations; no ask-basis anywhere.
4. Add a Listing: no rights review; any public broker URL except excluded ones.
5. Admin: sources tab = source_type + complaint/removal ("Remove on complaint" -> `remove_source`),
   "Void forecast" -> `void_forecast`, invites tab also issues operator listing invites
   (`listing_invites`, signed token link `/invite/[token]` that opens the valuation form with
   information_level = cim; route still to be built).
6. Signup/terms/points copy: newcomer floor (−3 over first 5 scored forecasts), `first5_floor_clipped`.
7. `npm run build`, `npm run lint`, `npx vitest run` green; then commit, push, link Vercel to the repo,
   add Supabase env vars, run migrations + seed, switch SCORING_MODE to live after the simulation gate.
