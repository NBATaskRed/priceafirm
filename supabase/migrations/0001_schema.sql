-- PriceAFirm MVP schema
-- Conventions: one immutable listing snapshot per valuation question; one scored forecast per
-- person x business x snapshot; one signed point balance derived from an immutable ledger.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type confidence_level as enum ('low', 'medium', 'high');
create type ask_basis as enum ('ev', 'equity', 'assets', 'unknown');
create type earnings_type as enum ('sde', 'ebitda', 'seller_cash_flow', 'unknown');
create type snapshot_status as enum ('draft', 'pending_review', 'approved', 'withdrawn');
create type domain_status as enum ('allowed', 'blocked', 'review');
create type ledger_kind as enum ('WELCOME_GRANT', 'URL_REVEAL', 'SCORE_CHANGE', 'REFUND', 'ADMIN_ADJUSTMENT');
create type exposure_surface as enum ('preview', 'ranked_list', 'reveal', 'post_submission');
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
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sources and rights
-- ---------------------------------------------------------------------------
create table source_domains (
  domain text primary key,            -- registrable host, lowercase, no www
  status domain_status not null default 'review',
  publisher text,
  policy_note text,
  may_fetch boolean not null default false,
  may_store boolean not null default false,
  may_display_ask boolean not null default false,
  may_display_ev_to_ask boolean not null default false,
  may_show_anonymous_preview boolean not null default false,
  may_link_original_listing boolean not null default false,
  may_log_referral boolean not null default false,
  attribution_required boolean not null default false,
  revoked_at timestamptz,
  effective_date date,
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
  ask_basis ask_basis not null default 'unknown',
  revenue numeric,
  revenue_period text,
  earnings numeric,
  earnings_type earnings_type not null default 'unknown',
  includes_inventory boolean,
  includes_nwc boolean,
  includes_real_estate boolean,
  includes_cash boolean,
  includes_debt boolean,
  deal_terms_note text,
  snapshot_date date not null default current_date,
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
  max_gain numeric not null,
  max_loss numeric not null,           -- stored as non-negative magnitude
  kernel_version text not null,
  scoring_version text not null,
  f_before jsonb not null,             -- serialized mixture before this forecast
  f_after jsonb not null,              -- serialized mixture including this forecast
  eligible boolean not null default true,
  eligibility_reason text,
  current_score numeric not null default 0,
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

-- ---------------------------------------------------------------------------
-- Exposure: has this person seen PriceAFirm-derived value information for this business?
-- ---------------------------------------------------------------------------
create or replace function is_exposed(p_user uuid, p_business uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from exposure_events
    where user_id = p_user and business_id = p_business
      and surface in ('preview', 'ranked_list', 'reveal')
  );
$$;

create or replace function record_exposure(p_user uuid, p_business uuid, p_snapshot uuid, p_surface exposure_surface)
returns void language sql as $$
  insert into exposure_events (user_id, business_id, snapshot_id, surface)
  values (p_user, p_business, p_snapshot, p_surface);
$$;

-- ---------------------------------------------------------------------------
-- Reveal original URL: atomic 1-point charge, once per (user, business); free re-opens;
-- free if the user submitted the URL themselves; refund path if no permitted URL exists.
-- ---------------------------------------------------------------------------
create or replace function reveal_url(p_user uuid, p_business uuid)
returns table (url text, charged boolean, balance numeric, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_snapshot listing_snapshots%rowtype;
  v_url text;
  v_balance numeric;
  v_self_submitted boolean;
  v_rights source_domains%rowtype;
begin
  -- serialize per user to prevent double-spend on concurrent clicks
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select * into v_snapshot from listing_snapshots
   where business_id = p_business and status = 'approved'
   order by version desc limit 1;
  if not found then
    return query select null::text, false, point_balance(p_user), 'not_found'; return;
  end if;

  select * into v_rights from source_domains where domain = v_snapshot.source_domain;
  if not found or not v_rights.may_link_original_listing or v_rights.revoked_at is not null then
    return query select null::text, false, point_balance(p_user), 'no_rights'; return;
  end if;

  select source_url into v_url from listing_sources where snapshot_id = v_snapshot.id;
  if v_url is null then
    return query select null::text, false, point_balance(p_user), 'no_url'; return;
  end if;

  -- already unlocked: free re-open
  if exists (select 1 from url_unlocks where user_id = p_user and business_id = p_business) then
    return query select v_url, false, point_balance(p_user), 'already_unlocked'; return;
  end if;

  v_self_submitted := exists (
    select 1 from source_submissions
    where user_id = p_user and business_id = p_business and status in ('approved','pending_review','duplicate')
  );

  if v_self_submitted then
    insert into url_unlocks (user_id, business_id, snapshot_id, charged) values (p_user, p_business, v_snapshot.id, false);
    return query select v_url, false, point_balance(p_user), 'self_submitted'; return;
  end if;

  v_balance := point_balance(p_user);
  if v_balance < 1 then
    return query select null::text, false, v_balance, 'insufficient'; return;
  end if;

  insert into url_unlocks (user_id, business_id, snapshot_id, charged) values (p_user, p_business, v_snapshot.id, true);
  insert into point_ledger (user_id, kind, amount, business_id, event_key, note)
  values (p_user, 'URL_REVEAL', -1, p_business, 'URL_REVEAL:' || p_user::text || ':' || p_business::text, 'Revealed source listing URL');
  insert into exposure_events (user_id, business_id, snapshot_id, surface) values (p_user, p_business, v_snapshot.id, 'reveal');

  return query select v_url, true, point_balance(p_user), 'charged';
end $$;

-- ---------------------------------------------------------------------------
-- Seal a blind forecast. The application computes the kernel, bounds and model snapshots; this
-- function enforces the invariants (blindness, uniqueness, approval, frozen m/bounds) atomically.
-- ---------------------------------------------------------------------------
create or replace function submit_forecast(
  p_user uuid, p_snapshot uuid, p_value numeric, p_confidence confidence_level,
  p_sigma double precision, p_weight double precision,
  p_m_before double precision, p_max_gain numeric, p_max_loss numeric,
  p_kernel_version text, p_scoring_version text,
  p_f_before jsonb, p_f_after jsonb, p_rationale text
) returns table (forecast_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_snap listing_snapshots%rowtype;
  v_org text;
  v_id uuid;
begin
  select * into v_snap from listing_snapshots where id = p_snapshot;
  if not found or v_snap.status <> 'approved' then
    return query select null::uuid, 'snapshot_not_approved'; return;
  end if;
  if is_exposed(p_user, v_snap.business_id) then
    return query select null::uuid, 'exposed'; return;
  end if;
  if exists (select 1 from forecast_submissions where user_id = p_user and business_id = v_snap.business_id) then
    return query select null::uuid, 'already_submitted'; return;
  end if;
  select org_key into v_org from profiles where id = p_user;

  insert into forecast_submissions (
    user_id, business_id, snapshot_id, value, log_value, confidence, sigma, weight, org_key,
    m_before, max_gain, max_loss, kernel_version, scoring_version, f_before, f_after, rationale
  ) values (
    p_user, v_snap.business_id, p_snapshot, p_value, ln(p_value), p_confidence, p_sigma, p_weight, v_org,
    p_m_before, p_max_gain, p_max_loss, p_kernel_version, p_scoring_version, p_f_before, p_f_after, p_rationale
  ) returning id into v_id;

  insert into exposure_events (user_id, business_id, snapshot_id, surface)
  values (p_user, v_snap.business_id, p_snapshot, 'post_submission');

  return query select v_id, 'sealed';
end $$;

-- ---------------------------------------------------------------------------
-- Post a score revaluation delta exactly once per (forecast, trigger).
-- ---------------------------------------------------------------------------
create or replace function post_score_change(
  p_forecast uuid, p_trigger uuid, p_later_count int, p_z double precision,
  p_new_score numeric, p_scoring_version text, p_live boolean
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_f forecast_submissions%rowtype;
  v_delta numeric;
begin
  select * into v_f from forecast_submissions where id = p_forecast for update;
  if not found then return 0; end if;
  v_delta := round(p_new_score - v_f.current_score, 4);

  insert into score_evaluations (forecast_id, triggered_by, later_count, z, previous_score, new_score, delta, scoring_version)
  values (p_forecast, p_trigger, p_later_count, p_z, v_f.current_score, p_new_score, v_delta, p_scoring_version);

  if p_live and v_delta <> 0 then
    begin
      insert into point_ledger (user_id, kind, amount, forecast_id, business_id, event_key, note)
      values (v_f.user_id, 'SCORE_CHANGE', v_delta, p_forecast, v_f.business_id,
              'SCORE_CHANGE:' || p_forecast::text || ':' || coalesce(p_trigger::text, 'recompute'),
              'Later independent valuation revalued this forecast');
    exception when unique_violation then
      return 0; -- already posted for this trigger; never mint twice
    end;
    update forecast_submissions set current_score = p_new_score where id = p_forecast;
  end if;
  return v_delta;
end $$;

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
create policy "forecasts: self read" on forecast_submissions for select using (auth.uid() = user_id);
create policy "evaluations: self read" on score_evaluations for select
  using (exists (select 1 from forecast_submissions f where f.id = forecast_id and f.user_id = auth.uid()));
create policy "ledger: self read" on point_ledger for select using (auth.uid() = user_id);
create policy "unlocks: self read" on url_unlocks for select using (auth.uid() = user_id);
create policy "exposures: self read" on exposure_events for select using (auth.uid() = user_id);
create policy "submissions: self read" on source_submissions for select using (auth.uid() = user_id);
create policy "skill: self read" on skill_statistics for select using (auth.uid() = user_id);
-- listing_sources, aggregation_cache, invites, query_events, admin_audit: no member policies (service role only).

revoke execute on function reveal_url(uuid, uuid) from public, anon, authenticated;
revoke execute on function submit_forecast(uuid, uuid, numeric, confidence_level, double precision, double precision, double precision, numeric, numeric, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function post_score_change(uuid, uuid, int, double precision, numeric, text, boolean) from public, anon, authenticated;
revoke execute on function record_exposure(uuid, uuid, uuid, exposure_surface) from public, anon, authenticated;
