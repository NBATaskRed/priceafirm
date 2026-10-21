# PriceAFirm

Blind valuation-contribution and business-discovery network for businesses already listed for sale.
Members value listings (one EV estimate + Low/Medium/High confidence), earn or lose points as later
independent valuations arrive, and spend 1 point to reveal a rights-cleared original listing URL.

Stack (same as fundstamp.com): Next.js 16 (App Router, TypeScript, Tailwind v4) on Vercel,
Supabase (Postgres + Auth magic links), Node 24.

## Layout

```
supabase/migrations/0001_schema.sql   consolidated v2.2 schema, RPCs, RLS
supabase/tests/                       Postgres smoke test for the money paths (also run in CI)
supabase/seed.sql                      source-domain policy (BizBuySell blocked) + fictional dev listings
src/lib/quant/model.ts                 pure engine: kernels, opinion pool, frozen bounds, peer-predictive score
src/lib/quant/service.ts               I/O: valuation question, seal forecast, recompute, aggregates, skill
src/lib/quant/simulate.ts              offline adversarial simulation harness
src/lib/sources/                       URL normalize, allowlist/blocklist, SSRF-safe fetch, fact extraction
src/lib/search/                        natural-language search -> filter chips -> deterministic filtering
src/lib/actions/                       server actions (all auth + eligibility checks are server-side)
src/app/                               screens: /value, /value/[id], /deals, /add, /points, /unlocked, /admin
src/proxy.ts                           session refresh + sign-in gate
```

## Local setup

```bash
npm install
cp .env.example .env.local        # fill in Supabase URL, anon key, service role key, SESSION_SECRET, CRON_SECRET
npm run dev
```

Tests and checks:

```bash
npx vitest run                    # engine, URL normalization, extraction, search parsing
npx tsx src/lib/quant/simulate.ts # scoring simulation (honest vs strategic judges)
npm run lint && npm run build
```

## Supabase

1. Create a project named `priceafirm` (region near Vercel's us-east is fine).
2. Run `supabase/migrations/0001_schema.sql` (single consolidated schema) in the SQL editor, or `supabase link` then `supabase db push`.
3. Run `supabase/seed.sql` for dev data. Delete the fictional listings before the pilot.
4. Auth: enable Email provider with magic links; set Site URL to the Vercel domain and add
   `https://<domain>/auth/callback` to Redirect URLs. Disable "Confirm email" double opt-in if you want
   one-click sign-in; magic links already verify ownership.
5. Copy the project URL, anon key and service role key into Vercel env vars.

Member-facing tables are RLS-protected and read-only; every write goes through security-definer RPCs or
the service role from server actions. `listing_sources.source_url` has no member policy at all: the only
path to a URL is the `reveal_url` RPC (atomic 1-point charge) or the caller's own `/unlocked` page.

## Vercel

Create the project from the Git repo (framework Next.js, Node 24). Environment variables:

| Key | Value |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | from Supabase |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | from Supabase |
| SUPABASE_SERVICE_ROLE_KEY | from Supabase (secret) |
| APP_URL | https://priceafirm.com (or the vercel.app domain) |
| ADMIN_EMAILS | comma-separated admin emails |
| SESSION_SECRET | `openssl rand -base64 48` |
| CRON_SECRET | `openssl rand -base64 48` (vercel.json cron sends it as a bearer token) |
| INVITE_ONLY | `1` for the pilot |
| SCORING_MODE | `shadow` until pilot shadow scores are reviewed, then `live` |
| ANTHROPIC_API_KEY | optional; enables LLM parsing of search intent |

`vercel.json` schedules `/api/cron/recompute` daily; it re-runs scoring idempotently and refreshes skill
percentiles. Score deltas are keyed per (forecast, trigger), so re-runs never mint duplicate points.

## Pilot operations

- Invite buyers at `/admin` (Invites tab); only invited emails or ADMIN_EMAILS can use the app while
  `INVITE_ONLY=1`.
- Approve new source domains and user-submitted listings in `/admin` after rights review. BizBuySell and
  BizQuest are hard-blocked in code and in `source_domains`.
- Start with `SCORING_MODE=shadow`: forecasts are sealed with frozen bounds and scores are computed and
  logged in `score_evaluations`, but no point deltas post. Switch to `live` once the simulation and pilot
  checks in the design's Section 16 pass.

## What the numbers mean (and don't)

Crowd values are model-derived from a conservative opinion pool (ask benchmark + confidence-weighted
lognormal kernels, capped per person, shrunk by effective participation). They are not offers, appraisals
or observed prices. Scores are a peer-predictive proxy (did a forecast improve predictions of later
independent forecasts?), not verified accuracy. The UI labels both accordingly.
