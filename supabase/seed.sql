-- Development seed (run after both migrations). Listing figures below are fictional; replace with the
-- operator's real NBA/Synergy listings before the pilot.

insert into source_domains (domain, status, source_type, publisher, attribution_text, notes)
values
  ('bizbuysell.com', 'blocked', 'excluded', 'BizBuySell / CoStar', null, 'Excluded: Terms of Use restrict extraction, database creation and certain links.'),
  ('bizquest.com', 'blocked', 'excluded', 'BizQuest / CoStar', null, 'Same operator family as BizBuySell. Excluded.'),
  ('synergybb.com', 'allowed', 'operator', 'Synergy Business Brokers', 'Listed by Synergy Business Brokers', 'Operator listings.'),
  ('nextbridgeadvisors.com', 'allowed', 'operator', 'Next Bridge Advisors', 'Listed by Next Bridge Advisors', 'Operator listings.')
on conflict (domain) do nothing;

with b as (
  insert into businesses (canonical_key) values
    ('synergybb.com:dev-hvac-se-001'),
    ('synergybb.com:dev-logistics-fl-002'),
    ('synergybb.com:dev-mfg-nc-003'),
    ('synergybb.com:dev-maint-ga-004'),
    ('synergybb.com:dev-b2bsoft-tx-005')
  on conflict (canonical_key) do update set canonical_key = excluded.canonical_key
  returning id, canonical_key
), s as (
  insert into listing_snapshots (business_id, source_domain, headline, industry, industry_tags, region, state, metro, asking_price, revenue, revenue_period, earnings, earnings_type, includes_inventory, includes_nwc, includes_real_estate, snapshot_date, status, approved_at)
  select b.id, 'synergybb.com', v.headline, v.industry, v.tags, v.region, v.state, v.metro, v.ask, v.rev, 'TTM', v.earn, v.etype::earnings_type, true, false, false, current_date, 'approved', now()
  from b join (values
    ('synergybb.com:dev-hvac-se-001', 'HVAC services', 'Mechanical contracting', array['hvac','services','residential','commercial'], 'Southeast US', 'FL', 'Tampa Bay', 2900000, 3200000, 680000, 'sde'),
    ('synergybb.com:dev-logistics-fl-002', 'Regional logistics', 'Transportation and logistics', array['logistics','trucking','b2b'], 'Southeast US', 'FL', 'Orlando', 4100000, 6500000, 910000, 'ebitda'),
    ('synergybb.com:dev-mfg-nc-003', 'Specialty manufacturing', 'Manufacturing', array['manufacturing','industrial','b2b'], 'Southeast US', 'NC', 'Charlotte', 5500000, 7800000, 1250000, 'ebitda'),
    ('synergybb.com:dev-maint-ga-004', 'Industrial maintenance', 'Industrial services', array['industrial','maintenance','services','b2b','recurring'], 'Southeast US', 'GA', 'Atlanta', 3600000, 4500000, 610000, 'ebitda'),
    ('synergybb.com:dev-b2bsoft-tx-005', 'B2B software', 'Software', array['software','saas','b2b','recurring'], 'South Central US', 'TX', 'Austin', 2400000, 1900000, 520000, 'sde')
  ) as v(key, headline, industry, tags, region, state, metro, ask, rev, earn, etype) on v.key = b.canonical_key
  returning id
)
insert into listing_sources (snapshot_id, source_url, source_url_hash, broker_name, listing_title_raw)
select s.id, 'https://www.synergybb.com/listings/dev-' || substr(s.id::text, 1, 8), encode(sha256(('dev' || s.id::text)::bytea), 'hex'), 'Synergy Business Brokers', 'Development placeholder listing'
from s;
