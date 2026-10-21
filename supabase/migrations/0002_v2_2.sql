-- Design v2.2 changes: ask is always EV; independent_count maintained transactionally; cap depends
-- only on coverage; newcomer floor; free reveals below 3 valuations; permissionless sources with
-- removal on complaint; Find Deals exposure on render; operator invites; voiding.

-- ---------------------------------------------------------------------------
-- Sources: permission flags -> source_type + complaint/removal
-- ---------------------------------------------------------------------------
alter table source_domains
  add column source_type text not null default 'third_party' check (source_type in ('operator','third_party','excluded')),
  add column attribution_text text,
  add column first_seen timestamptz not null default now(),
  add column complaint_received_at timestamptz,
  add column removed_at timestamptz,
  add column removal_reason text,
  add column notes text;
update source_domains set source_type = 'excluded' where status = 'blocked';
update source_domains set source_type = 'operator' where domain in ('synergybb.com','nextbridgeadvisors.com');
alter table source_domains
  drop column may_fetch, drop column may_store, drop column may_display_ask, drop column may_display_ev_to_ask,
  drop column may_show_anonymous_preview, drop column may_link_original_listing, drop column may_log_referral,
  drop column attribution_required, drop column revoked_at, drop column effective_date, drop column policy_note;
-- status stays for the excluded list: 'blocked' = excluded, 'allowed' = everything else

create or replace function source_is_live(p_domain text)
returns boolean language sql stable as $$
  select exists (select 1 from source_domains where domain = p_domain and status <> 'blocked' and removed_at is null);
$$;

-- ---------------------------------------------------------------------------
-- Listings: ask is EV; independent_count
-- ---------------------------------------------------------------------------
alter table listing_snapshots
  drop column ask_basis,
  drop column includes_cash,
  drop column includes_debt,
  add column independent_count int not null default 0;
drop type ask_basis;

-- ---------------------------------------------------------------------------
-- Forecasts: coverage-only cap, information level, independence flag
-- ---------------------------------------------------------------------------
alter table forecast_submissions
  drop column max_gain,
  drop column max_loss,
  drop column f_after,
  add column cap numeric not null default 10,
  add column information_level text not null default 'listing' check (information_level in ('listing','cim')),
  add column counts_toward_independent boolean not null default true,
  add column voided_at timestamptz,
  add column void_reason text,
  add column raw_score numeric not null default 0;   -- before newcomer floor; current_score = posted (floored)
alter table forecast_submissions alter column f_before set not null;

alter table score_evaluations add column raw_score numeric;

-- Newcomer floor state
alter table profiles add column first5_floor_clipped numeric not null default 0;

-- Exposure surfaces
alter type exposure_surface add value if not exists 'find_deals_row';

-- Ledger: free reveals are recorded
alter type ledger_kind add value if not exists 'URL_REVEAL_FREE';

alter table url_unlocks add column count_at_unlock int not null default 0;

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
alter table listing_invites enable row level security;

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
