-- PriceAFirm MVP schema (design v2.2, consolidated)
-- Conventions: one immutable listing snapshot per valuation question; one scored forecast per
-- person x business x snapshot; one signed point balance derived from an immutable ledger.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type confidence_level as enum ('low', 'medium', 'high');
create type earnings_type as enum ('sde', 'ebitda', 'seller_cash_flow', 'unknown');
create type snapshot_status as enum ('draft', 'pending_review', 'approved', 'withdrawn');
create type domain_status as enum ('allowed', 'blocked', 'review');
create type ledger_kind as enum ('WELCOME_GRANT', 'URL_REVEAL', 'URL_REVEAL_FREE', 'SCORE_CHANGE', 'REFUND', 'ADMIN_ADJUSTMENT');
create type exposure_surface as enum ('preview', 'ranked_list', 'reveal', 'post_submission', 'find_deals_row');
create type submission_status as enum ('rejected', 'pending_review', 'approved', 'duplicate');

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table invites (
  email text primary key,
  invited_by uuid,
  note text,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  org_key text,                       -- related-account clustering (same firm => one effective voice)
  role text not null default 'member' check (role in ('member', 'admin')),
  invited boolean not null default false,
  trust_status text not null default 'normal' check (trust_status in ('normal', 'watch', 'frozen')),
  accepted_terms_version text,
  accepted_terms_at timestamptz,
  buyer_profile jsonb not null default '{}'::jsonb,
  first5_floor_clipped numeric not null default 0, -- newcomer floor bookkeeping
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sources and rights
-- ---------------------------------------------------------------------------
create table source_domains (
  domain text primary key,            -- registrable host, lowercase, no www
  status domain_status not null default 'allowed',   -- 'blocked' = excluded list
  source_type text not null default 'third_party' check (source_type in ('operator','third_party','excluded')),
  publisher text,
  attribution_text text,
  first_seen timestamptz not null default now(),
  complaint_received_at timestamptz,
  removed_at timestamptz,
  removal_reason text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Businesses and immutable listing snapshots
-- ---------------------------------------------------------------------------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique, -- domain + normalized listing id (dedupe key)
  created_at timestamptz not null default now()
);

create table listing_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  version int not null default 1,
  source_domain text not null references source_domains(domain),
  -- Neutral, non-identifying facts shown in the Value queue:
  headline text not null,              -- e.g. "HVAC services"  (never the broker's title verbatim)
  industry text not null,
  industry_tags text[] not null default '{}',
  region text,                         -- e.g. "Southeast US"
  state text,                          -- 2-letter
  metro text,
  asking_price numeric,
  ask_currency text not null default 'USD',
  revenue numeric,
  revenue_period text,
  earnings numeric,
  earnings_type earnings_type not null default 'unknown',
  includes_inventory boolean,
  includes_nwc boolean,
  includes_real_estate boolean,
  deal_terms_note text,
  snapshot_date date not null default current_date,
  independent_count int not null default 0, -- n_ind, maintained in submit_forecast / void_forecast
  content_hash text,
  status snapshot_status not null default 'pending_review',
  submitted_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, version)
);
create index on listing_snapshots (status, state, industry);

-- Identifying source details live apart from the neutral facts and are never selectable by members.
create table listing_sources (
  snapshot_id uuid primary key references listing_snapshots(id) on delete cascade,
  source_url text not null,
  source_url_hash text not null,
  broker_name text,
  listing_title_raw text,
  extracted jsonb not null default '{}'::jsonb,
  fetched_at timestamptz
);
create index on listing_sources (source_url_hash);

create table source_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  submitted_url text not null,
  normalized_url text,
  domain text,
  status submission_status not null,
  reason text,
  business_id uuid references businesses(id),
  snapshot_id uuid references listing_snapshots(id),
  created_at timestamptz not null default now()
);
create index on source_submissions (user_id, business_id);

-- ---------------------------------------------------------------------------
-- Forecasts, frozen contracts, evaluations
-- ---------------------------------------------------------------------------
create table forecast_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  business_id uuid not null references businesses(id),
  snapshot_id uuid not null references listing_snapshots(id),
  value numeric not null check (value > 0),
  log_value double precision not null,
  confidence confidence_level not null,
  sigma double precision not null,
  weight double precision not null,
  org_key text,
  -- frozen score contract
  m_before double precision not null,  -- n_eff immediately before this forecast
  cap numeric not null,                -- possible score is [-cap, +cap] for every confidence
  kernel_version text not null,
  scoring_version text not null,
  f_before jsonb not null,             -- serialized crowd mixture before this forecast
  information_level text not null default 'listing' check (information_level in ('listing','cim')),
  counts_toward_independent boolean not null default true,
  voided_at timestamptz,
  void_reason text,
  eligible boolean not null default true,
  eligibility_reason text,
  raw_score numeric not null default 0,      -- before newcomer floor
  current_score numeric not null default 0,  -- posted (floored); equals sum of SCORE_CHANGE deltas
  rationale text,                      -- private, optional
  created_at timestamptz not null default now(),
  unique (user_id, business_id, snapshot_id)
);
create index on forecast_submissions (snapshot_id, created_at);
create index on forecast_submissions (user_id, created_at desc);

create table score_evaluations (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references forecast_submissions(id) on delete cascade,
  triggered_by uuid references forecast_submissions(id) on delete set null,
  later_count int not null,
  z double precision not null,
  previous_score numeric not null,
  new_score numeric not null,
  delta numeric not null,
  raw_score numeric,
  scoring_version text not null,
  created_at timestamptz not null default now()
);
create index on score_evaluations (forecast_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Points ledger, unlocks, exposures
-- ---------------------------------------------------------------------------
create table point_ledger (
  id bigserial primary key,
  user_id uuid not null references profiles(id),
  kind ledger_kind not null,
  amount numeric not null,
  forecast_id uuid references forecast_submissions(id),
  business_id uuid references businesses(id),
  event_key text not null unique,     -- idempotency: retries never mint duplicates
  note text,
  created_at timestamptz not null default now()
);
create index on point_ledger (user_id, created_at desc);

create table url_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  business_id uuid not null references businesses(id),
  snapshot_id uuid not null references listing_snapshots(id),
  charged boolean not null default true,
  count_at_unlock int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, business_id)
);

create table exposure_events (
  id bigserial primary key,
  user_id uuid not null references profiles(id),
  business_id uuid not null references businesses(id),
  snapshot_id uuid references listing_snapshots(id),
  surface exposure_surface not null,
  created_at timestamptz not null default now()
);
create index on exposure_events (user_id, business_id);

-- ---------------------------------------------------------------------------
-- Aggregates and skill
-- ---------------------------------------------------------------------------
create table aggregation_cache (
  snapshot_id uuid primary key references listing_snapshots(id) on delete cascade,
  business_id uuid not null references businesses(id),
  n_count int not null default 0,     -- independent valuations contributing
  n_eff double precision not null default 0,
  stats jsonb not null default '{}'::jsonb,   -- publishable model-derived statistics
  attractiveness double precision,            -- internal ranking input for Find deals
  model_version text,
  updated_at timestamptz not null default now()
);

create table skill_statistics (
  user_id uuid primary key references profiles(id) on delete cascade,
  scored_count int not null default 0,
  skill_metric double precision,
  percentile double precision,
  sufficient boolean not null default false,
  model_version text,
  updated_at timestamptz not null default now()
);

create table query_events (
  id bigserial primary key,
  user_id uuid references profiles(id),
  raw_query text,
  filters jsonb,
  result_count int,
  created_at timestamptz not null default now()
);

create table admin_audit (
  id bigserial primary key,
  actor uuid references profiles(id),
  action text not null,
  target text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Operator-listing invites (buyer x listing after NDA)
create table listing_invites (
  token text primary key,
  snapshot_id uuid not null references listing_snapshots(id) on delete cascade,
  buyer_email text not null,
  information_level text not null default 'cim' check (information_level in ('listing','cim')),
  issued_at timestamptz not null default now(),
  opened_at timestamptz,
  submitted_at timestamptz,
  created_by uuid references profiles(id)
);

-- ---------------------------------------------------------------------------
-- Balance helper
-- ---------------------------------------------------------------------------
create or replace function point_balance(p_user uuid)
returns numeric language sql stable as $$
  select coalesce(sum(amount), 0) from point_ledger where user_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- Profile creation + welcome grant on auth signup
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(new.email);
  v_invited boolean;
  v_org text;
begin
  v_invited := exists (select 1 from invites where lower(email) = v_email);
  v_org := split_part(v_email, '@', 2);
  if v_org in ('gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','proton.me','protonmail.com') then
    v_org := v_email; -- personal mailboxes are their own cluster
  end if;
  insert into profiles (id, email, invited, org_key)
  values (new.id, v_email, v_invited, v_org)
  on conflict (id) do nothing;
  insert into point_ledger (user_id, kind, amount, event_key, note)
  values (new.id, 'WELCOME_GRANT', 3, 'WELCOME_GRANT:' || new.id::text, 'Signup grant')
  on conflict (event_key) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function record_exposure(p_user uuid, p_business uuid, p_snapshot uuid, p_surface exposure_surface)
returns void language sql as $$
  insert into exposure_events (user_id, business_id, snapshot_id, surface)
  values (p_user, p_business, p_snapshot, p_surface);
$$;

-- ---------------------------------------------------------------------------
-- Row level security: members read only their own rows; all writes go through
-- security-definer functions or the service role.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table invites enable row level security;
alter table source_domains enable row level security;
alter table businesses enable row level security;
alter table listing_snapshots enable row level security;
alter table listing_sources enable row level security;
alter table source_submissions enable row level security;
alter table forecast_submissions enable row level security;
alter table score_evaluations enable row level security;
alter table point_ledger enable row level security;
alter table url_unlocks enable row level security;
alter table exposure_events enable row level security;
alter table aggregation_cache enable row level security;
alter table skill_statistics enable row level security;
alter table query_events enable row level security;
alter table admin_audit enable row level security;

create policy "profiles: self read" on profiles for select using (auth.uid() = id);
create policy "profiles: self update" on profiles for update using (auth.uid() = id);
create policy "snapshots: approved readable" on listing_snapshots for select using (status = 'approved');
create policy "domains: readable" on source_domains for select using (true);
alter table listing_invites enable row level security;
create policy "forecasts: self read" on forecast_submissions for select using (auth.uid() = user_id);
create policy "evaluations: self read" on score_evaluations for select
  using (exists (select 1 from forecast_submissions f where f.id = forecast_id and f.user_id = auth.uid()));
create policy "ledger: self read" on point_ledger for select using (auth.uid() = user_id);
create policy "unlocks: self read" on url_unlocks for select using (auth.uid() = user_id);
create policy "exposures: self read" on exposure_events for select using (auth.uid() = user_id);
create policy "submissions: self read" on source_submissions for select using (auth.uid() = user_id);
create policy "skill: self read" on skill_statistics for select using (auth.uid() = user_id);
-- listing_sources, aggregation_cache, invites, query_events, admin_audit: no member policies (service role only).

revoke execute on function record_exposure(uuid, uuid, uuid, exposure_surface) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- v2.2 functions
-- ---------------------------------------------------------------------------
create or replace function source_is_live(p_domain text)
returns boolean language sql stable as $$
  select exists (select 1 from source_domains where domain = p_domain and status <> 'blocked' and removed_at is null);
$$;

-- ---------------------------------------------------------------------------
-- is_exposed: Find Deals rows count; previews (legacy) and reveals too
-- ---------------------------------------------------------------------------
create or replace function is_exposed(p_user uuid, p_business uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from exposure_events
    where user_id = p_user and business_id = p_business
      and surface in ('preview', 'ranked_list', 'reveal', 'find_deals_row')
  );
$$;

-- ---------------------------------------------------------------------------
-- Reveal: free below 3 independent valuations, 1 point at 3+, free for the submitter, once per business
-- ---------------------------------------------------------------------------
drop function if exists reveal_url(uuid, uuid);
create or replace function reveal_url(p_user uuid, p_business uuid)
returns table (url text, charged boolean, balance numeric, status text, count int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_snapshot listing_snapshots%rowtype;
  v_url text;
  v_balance numeric;
  v_self boolean;
  v_count int;
  v_free_today int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select * into v_snapshot from listing_snapshots
   where business_id = p_business and status = 'approved' order by version desc limit 1;
  if not found then return query select null::text, false, point_balance(p_user), 'not_found', 0; return; end if;
  if not source_is_live(v_snapshot.source_domain) then
    return query select null::text, false, point_balance(p_user), 'removed', v_snapshot.independent_count; return;
  end if;
  select source_url into v_url from listing_sources where snapshot_id = v_snapshot.id;
  if v_url is null then return query select null::text, false, point_balance(p_user), 'no_url', v_snapshot.independent_count; return; end if;

  v_count := v_snapshot.independent_count;

  if exists (select 1 from url_unlocks where user_id = p_user and business_id = p_business) then
    return query select v_url, false, point_balance(p_user), 'already_unlocked', v_count; return;
  end if;

  v_self := exists (select 1 from source_submissions where user_id = p_user and business_id = p_business
                     and status in ('approved','pending_review','duplicate'));
  if v_self or v_count < 3 then
    if not v_self then
      select count(*) into v_free_today from url_unlocks
       where user_id = p_user and charged = false and created_at > now() - interval '1 day';
      if v_free_today >= 20 then
        return query select null::text, false, point_balance(p_user), 'rate_limited', v_count; return;
      end if;
    end if;
    insert into url_unlocks (user_id, business_id, snapshot_id, charged, count_at_unlock) values (p_user, p_business, v_snapshot.id, false, v_count);
    insert into point_ledger (user_id, kind, amount, business_id, event_key, note)
    values (p_user, 'URL_REVEAL_FREE', 0, p_business, 'URL_REVEAL:' || p_user::text || ':' || p_business::text,
            case when v_self then 'Revealed URL you submitted (free)' else 'Revealed source URL (free, fewer than 3 valuations)' end);
    insert into exposure_events (user_id, business_id, snapshot_id, surface) values (p_user, p_business, v_snapshot.id, 'reveal');
    return query select v_url, false, point_balance(p_user), case when v_self then 'self_submitted' else 'free' end, v_count; return;
  end if;

  v_balance := point_balance(p_user);
  if v_balance < 1 then return query select null::text, false, v_balance, 'insufficient', v_count; return; end if;

  insert into url_unlocks (user_id, business_id, snapshot_id, charged, count_at_unlock) values (p_user, p_business, v_snapshot.id, true, v_count);
  insert into point_ledger (user_id, kind, amount, business_id, event_key, note)
  values (p_user, 'URL_REVEAL', -1, p_business, 'URL_REVEAL:' || p_user::text || ':' || p_business::text, 'Revealed source URL (' || v_count || ' valuations)');
  insert into exposure_events (user_id, business_id, snapshot_id, surface) values (p_user, p_business, v_snapshot.id, 'reveal');
  return query select v_url, true, point_balance(p_user), 'charged', v_count;
end $$;
revoke execute on function reveal_url(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seal a forecast: cap only; increments independent_count in the same transaction when the
-- submitter's org cluster has not already contributed.
-- ---------------------------------------------------------------------------
drop function if exists submit_forecast(uuid, uuid, numeric, confidence_level, double precision, double precision, double precision, numeric, numeric, text, text, jsonb, jsonb, text);
create or replace function submit_forecast(
  p_user uuid, p_snapshot uuid, p_value numeric, p_confidence confidence_level,
  p_sigma double precision, p_weight double precision,
  p_m_before double precision, p_cap numeric,
  p_kernel_version text, p_scoring_version text,
  p_f_before jsonb, p_rationale text, p_information_level text
) returns table (forecast_id uuid, status text, independent_count int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_snap listing_snapshots%rowtype;
  v_org text;
  v_id uuid;
  v_counts boolean;
  v_daily int;
begin
  select * into v_snap from listing_snapshots where id = p_snapshot for update;
  if not found or v_snap.status <> 'approved' then return query select null::uuid, 'snapshot_not_approved', 0; return; end if;
  if not source_is_live(v_snap.source_domain) then return query select null::uuid, 'removed', v_snap.independent_count; return; end if;
  if is_exposed(p_user, v_snap.business_id) then return query select null::uuid, 'exposed', v_snap.independent_count; return; end if;
  if exists (select 1 from forecast_submissions where user_id = p_user and business_id = v_snap.business_id) then
    return query select null::uuid, 'already_submitted', v_snap.independent_count; return;
  end if;
  select count(*) into v_daily from forecast_submissions where user_id = p_user and created_at > now() - interval '1 day';
  if v_daily >= 20 then return query select null::uuid, 'rate_limited', v_snap.independent_count; return; end if;

  select org_key into v_org from profiles where id = p_user;
  v_counts := v_org is null or not exists (
    select 1 from forecast_submissions
    where snapshot_id = p_snapshot and org_key = v_org and counts_toward_independent and voided_at is null
  );

  insert into forecast_submissions (
    user_id, business_id, snapshot_id, value, log_value, confidence, sigma, weight, org_key,
    m_before, cap, kernel_version, scoring_version, f_before, rationale, information_level, counts_toward_independent
  ) values (
    p_user, v_snap.business_id, p_snapshot, p_value, ln(p_value), p_confidence, p_sigma, p_weight, v_org,
    p_m_before, p_cap, p_kernel_version, p_scoring_version, p_f_before, p_rationale, coalesce(p_information_level, 'listing'), v_counts
  ) returning id into v_id;

  if v_counts then
    update listing_snapshots set independent_count = independent_count + 1 where id = p_snapshot returning listing_snapshots.independent_count into v_snap.independent_count;
  end if;

  insert into exposure_events (user_id, business_id, snapshot_id, surface) values (p_user, v_snap.business_id, p_snapshot, 'post_submission');
  return query select v_id, 'sealed', v_snap.independent_count;
end $$;
revoke execute on function submit_forecast(uuid, uuid, numeric, confidence_level, double precision, double precision, double precision, numeric, text, text, jsonb, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Post a (floored) score exactly once per (forecast, trigger)
-- ---------------------------------------------------------------------------
drop function if exists post_score_change(uuid, uuid, int, double precision, numeric, text, boolean);
create or replace function post_score_change(
  p_forecast uuid, p_trigger uuid, p_later_count int, p_z double precision,
  p_raw_score numeric, p_posted_score numeric, p_scoring_version text, p_live boolean
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_f forecast_submissions%rowtype;
  v_delta numeric;
begin
  select * into v_f from forecast_submissions where id = p_forecast for update;
  if not found then return 0; end if;
  v_delta := round(p_posted_score - v_f.current_score, 4);
  insert into score_evaluations (forecast_id, triggered_by, later_count, z, previous_score, new_score, delta, scoring_version, raw_score)
  values (p_forecast, p_trigger, p_later_count, p_z, v_f.current_score, p_posted_score, v_delta, p_scoring_version, p_raw_score);
  update forecast_submissions set raw_score = p_raw_score where id = p_forecast;
  if p_live and v_delta <> 0 then
    begin
      insert into point_ledger (user_id, kind, amount, forecast_id, business_id, event_key, note)
      values (v_f.user_id, 'SCORE_CHANGE', v_delta, p_forecast, v_f.business_id,
              'SCORE_CHANGE:' || p_forecast::text || ':' || coalesce(p_trigger::text, 'recompute'),
              'Later independent valuation revalued this forecast');
    exception when unique_violation then
      return 0;
    end;
    update forecast_submissions set current_score = p_posted_score where id = p_forecast;
  end if;
  return v_delta;
end $$;
revoke execute on function post_score_change(uuid, uuid, int, double precision, numeric, numeric, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin void: removes a forecast from scoring and decrements the count through a recorded event
-- ---------------------------------------------------------------------------
create or replace function void_forecast(p_forecast uuid, p_reason text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_f forecast_submissions%rowtype;
begin
  select * into v_f from forecast_submissions where id = p_forecast for update;
  if not found or v_f.voided_at is not null then return; end if;
  update forecast_submissions set voided_at = now(), void_reason = p_reason, eligible = false where id = p_forecast;
  if v_f.counts_toward_independent then
    update forecast_submissions set counts_toward_independent = false where id = p_forecast;
    update listing_snapshots set independent_count = greatest(0, independent_count - 1) where id = v_f.snapshot_id;
  end if;
  insert into admin_audit (actor, action, target, payload) values (p_actor, 'void_forecast', p_forecast::text, jsonb_build_object('reason', p_reason));
end $$;
revoke execute on function void_forecast(uuid, text, uuid) from public, anon, authenticated;

-- Remove a source on complaint
create or replace function remove_source(p_domain text, p_reason text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update source_domains set removed_at = now(), removal_reason = p_reason, complaint_received_at = coalesce(complaint_received_at, now()) where domain = p_domain;
  insert into admin_audit (actor, action, target, payload) values (p_actor, 'remove_source', p_domain, jsonb_build_object('reason', p_reason));
end $$;
revoke execute on function remove_source(text, text, uuid) from public, anon, authenticated;
