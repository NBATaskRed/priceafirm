-- Smoke test for the money paths. Run against a FRESH database after migration + seed.
-- Locally: see README "Database smoke test". Expected values are in comments.
insert into auth.users(email) values ('a@firm1.com'),('b@firm1.com'),('c@gmail.com'),('d@x.com'),('e@y.com'),('f@z.com'),('g@w.com');
select 'grant', email, point_balance(id) from profiles order by email;                                  -- all 3
create temp table L as select s.id sid, s.business_id bid from listing_snapshots s where headline='HVAC services';
create temp table U as select email, id from profiles;
select 'c reveal@0', (r).status, (r).charged, (r).balance from (select reveal_url((select id from U where email='c@gmail.com'),(select bid from L)) r) x;  -- free f 3
select 'c submit after reveal', status from submit_forecast((select id from U where email='c@gmail.com'),(select sid from L),2500000,'medium',0.35,1,0,10,'k','s','{}'::jsonb,null,'listing');  -- exposed
select 'a', status, independent_count from submit_forecast((select id from U where email='a@firm1.com'),(select sid from L),2500000,'medium',0.35,1,0,10,'k','s','{}'::jsonb,null,'cim');      -- sealed 1
select 'b same org', status, independent_count from submit_forecast((select id from U where email='b@firm1.com'),(select sid from L),2600000,'high',0.22,1.5,1,7.07,'k','s','{}'::jsonb,null,'listing');  -- sealed 1
select 'a again', status from submit_forecast((select id from U where email='a@firm1.com'),(select sid from L),2700000,'low',0.55,0.6,1,7.07,'k','s','{}'::jsonb,null,'listing');  -- already_submitted
select 'd', status, independent_count from submit_forecast((select id from U where email='d@x.com'),(select sid from L),3000000,'low',0.55,0.6,1,7.07,'k','s','{}'::jsonb,null,'listing');  -- sealed 2
select 'e reveal@2', (r).status, (r).balance, (r).count from (select reveal_url((select id from U where email='e@y.com'),(select bid from L)) r) x;  -- free 3 2
select 'f', status, independent_count from submit_forecast((select id from U where email='f@z.com'),(select sid from L),2800000,'medium',0.35,1,2,5.77,'k','s','{}'::jsonb,null,'listing');  -- sealed 3
select 'g reveal@3', (r).status, (r).charged, (r).balance, (r).count from (select reveal_url((select id from U where email='g@w.com'),(select bid from L)) r) x;  -- charged t 2 3
select 'g reopen', (r).status, (r).balance from (select reveal_url((select id from U where email='g@w.com'),(select bid from L)) r) x;  -- already_unlocked 2
select 'e reopen still free', (r).status, (r).balance from (select reveal_url((select id from U where email='e@y.com'),(select bid from L)) r) x;  -- already_unlocked 3
select 'post1', post_score_change((select id from forecast_submissions where user_id=(select id from U where email='a@firm1.com')), null, 2, 0.4, 2.5, 2.5, 's', true);  -- 2.5
select 'post dup', post_score_change((select id from forecast_submissions where user_id=(select id from U where email='a@firm1.com')), null, 2, 0.4, 2.5, 2.5, 's', true);  -- 0 (retry posts nothing)
select 'post new trigger', post_score_change((select id from forecast_submissions where user_id=(select id from U where email='a@firm1.com')), (select id from forecast_submissions where user_id=(select id from U where email='f@z.com')), 3, -0.2, -1.0, -1.0, 's', true);  -- -3.5
select 'recompute again', post_score_change((select id from forecast_submissions where user_id=(select id from U where email='a@firm1.com')), null, 3, 0.1, -0.5, -0.5, 's', true);  -- 0.5 (second untriggered recompute still posts)
select 'score = sum of deltas', (select current_score from forecast_submissions where user_id=(select id from U where email='a@firm1.com')) = (select sum(amount) from point_ledger where kind='SCORE_CHANGE' and forecast_id=(select id from forecast_submissions where user_id=(select id from U where email='a@firm1.com')));  -- t
select 'a balance', point_balance((select id from U where email='a@firm1.com'));  -- 2.5 (3 + 2.5 - 3.5 + 0.5)
select 'a paid reveal blocked', (r).status from (select reveal_url((select id from U where email='a@firm1.com'),(select bid from L)) r) x;  -- charged (balance 2 >= 1)
select void_forecast((select id from forecast_submissions where user_id=(select id from U where email='d@x.com')),'test',null);
select 'after void count', independent_count from listing_snapshots where id=(select sid from L);  -- 2
select remove_source('synergybb.com','test complaint',null);
select 'reveal after removal', (r).status from (select reveal_url((select id from U where email='d@x.com'),(select bid from L)) r) x;  -- removed
-- Invite plumbing: system-onboarded submission (no user), invite row, outbox row.
insert into source_submissions (user_id, submitted_url, status) values (null, 'https://x.co/1', 'approved');
insert into listing_invites (token_hash, snapshot_id, business_id, user_id, buyer_email, expires_at)
  select 'h1', s.id, s.business_id, p.id, p.email, now() + interval '30 days' from listing_snapshots s, profiles p where s.headline='Regional logistics' and p.email='c@gmail.com';
insert into mail_outbox (kind, to_email, subject, text_body, html_body, related_invite) select 'valuation_request','c@gmail.com','s','t','h', id from listing_invites;
select 'invite+outbox', count(*) from mail_outbox;  -- 1
