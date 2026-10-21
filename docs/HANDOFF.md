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

## App layer (built to v2.2, committed 9ce72af)
All screens, server actions and admin tools listed in the design are implemented; `npm run build`,
`npm run lint`, `npx tsc --noEmit` and `npx vitest run` (73 tests) are green. Not yet exercised against a
live Supabase project.

## Remaining
1. Create GitHub repo NBATaskRed/priceafirm (user), push, link Vercel project `priceafirm` to it.
2. Create Supabase project, run a consolidated migration (0001 + 0002) and seed, enable email magic links,
   set the three Supabase env vars in Vercel, deploy, smoke-test the acceptance list in design Section 18.
3. Build `/invite/[token]` (operator listing invite link opening the valuation form with
   information_level = cim) and the hook from the NBA buyer-qualification flow that issues invites.
4. Replace the placeholder multiple table in `src/lib/quant/model.ts` with the operator's deal-history table.
5. Flip SCORING_MODE from shadow to live after reviewing shadow scores from the pilot.
