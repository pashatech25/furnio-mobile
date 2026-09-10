-- Acceptance checks against ALL real Furnio migrations, not ledger-fixture.sql.
-- Synthetic identities and purchases only, in a network-disabled disposable DB.
\o /dev/null
begin;
create temporary table schema_acceptance_passes(label text not null);
create function pg_temp.assert_true(passed boolean, label text) returns void language plpgsql as $$
begin
  if passed is distinct from true then raise exception 'Schema acceptance failed: %',label; end if;
  insert into pg_temp.schema_acceptance_passes values(label);
end $$;

select pg_temp.assert_true(not exists(
  select 1 from private.native_commerce_settings s, jsonb_each(to_jsonb(s)) field
  where field.key <> 'singleton' and field.value='true'::jsonb
), 'All native commerce rollout switches start disabled');
select pg_temp.assert_true(not exists(
  select 1 from private.mobile_account_settings s, jsonb_each(to_jsonb(s)) field
  where field.key <> 'singleton' and field.value='true'::jsonb
), 'All account deletion rollout switches start disabled');

insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000901','schema-owner@example.invalid','{"full_name":"Schema Owner"}'),
 ('00000000-0000-4000-8000-000000000902','schema-other@example.invalid','{}');
select pg_temp.assert_true((select count(*)=2 and bool_and(phone_verification_required)
  from public.profiles where id in ('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902')),
  'Real signup trigger creates both profiles and retains SMS requirement');
select pg_temp.assert_true(not exists(select 1 from public.consent_events
  where user_id='00000000-0000-4000-8000-000000000901'),
  'Signup does not invent consent absent accepted policy metadata');

insert into public.billing_packages(id,key,name,interval,unit_amount_cents,base_credits,total_credits)
 values('20000000-0000-4000-8000-000000000901','schema_pack','Schema credits','one_time',2000,20,20),
 ('20000000-0000-4000-8000-000000000902','schema_month','Schema monthly','month',5000,50,50);
insert into public.billing_package_versions(id,package_id,config_hash,stripe_product_id,stripe_price_id,
 package_key,name,interval,unit_amount_cents,currency,base_credits,bonus_percent,total_credits,rollover_limit,max_source_photos_per_project)
 select id,id,'schema:'||key,'prod_test_'||key,'price_test_'||key,key,name,interval,unit_amount_cents,
 currency,base_credits,bonus_percent,total_credits,rollover_limit,max_source_photos_per_project
 from public.billing_packages where key in ('schema_pack','schema_month');
insert into public.native_product_versions(environment,store,product_id,package_version_id) values
 ('SANDBOX','APP_STORE','schema.pack','20000000-0000-4000-8000-000000000901'),
 ('SANDBOX','PLAY_STORE','schema.month','20000000-0000-4000-8000-000000000902');
select pg_temp.assert_true((select credits=20 and kind='consumable' from public.native_product_versions
  where product_id='schema.pack'), 'Native entitlements snapshot the constrained customer package version');

do $$ begin
  begin
    perform public.record_verified_native_purchase('00000000-0000-4000-8000-000000000901','SANDBOX','APP_STORE',
      'schema-pack-1','rc-purchase:schema-pack-1','schema.pack',now());
    raise exception 'Disabled reconciliation unexpectedly granted a purchase';
  exception when sqlstate '55000' then null; end;
end $$;
update private.native_commerce_settings set environment='SANDBOX',reconciliation_enabled=true;
insert into public.trial_entitlements(user_id,state,successful_output_limit,attempt_limit,unlock_credits,
 allowed_service_slugs,starts_at,expires_at)
 values('00000000-0000-4000-8000-000000000901','active',3,6,5,array['stage','twilight'],now(),now()+interval '7 days');

set local role service_role;
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000901','SANDBOX','APP_STORE',
 'schema-pack-1','rc-purchase:schema-pack-1','schema.pack',now());
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000901','SANDBOX','APP_STORE',
 'schema-pack-1','rc-purchase:schema-pack-1','schema.pack',now());
reset role;
select pg_temp.assert_true(public.credit_balance('00000000-0000-4000-8000-000000000901')=20
 and (select count(*)=1 from public.native_transactions), 'Real service-role purchase grants once under all application triggers');
select pg_temp.assert_true((select state='converted' and conversion_source='native_purchase' from public.trial_entitlements
 where user_id='00000000-0000-4000-8000-000000000901'), 'Verified native purchase converts an active trial');
select pg_temp.assert_true((select stripe_customer_id is null and phone_verification_required from public.profiles
 where id='00000000-0000-4000-8000-000000000901') and not exists(select 1 from public.subscriptions),
 'Native purchase leaves Stripe identifiers and SMS verification untouched');
do $$ begin
  begin perform public.record_verified_native_purchase('00000000-0000-4000-8000-000000000902','SANDBOX','APP_STORE',
    'schema-pack-1','rc-purchase:schema-pack-1','schema.pack',now()); raise exception 'Cross-account purchase restored';
  exception when insufficient_privilege then null; end;
  begin perform public.record_verified_native_purchase('00000000-0000-4000-8000-000000000901','PRODUCTION','APP_STORE',
    'production-fake','production-fake','schema.pack',now()); raise exception 'Mixed store environment granted credits';
  exception when sqlstate '55000' then null; end;
end $$;
select pg_temp.assert_true(true, 'Cross-account restore and mixed-environment purchase are rejected');

insert into public.projects(id,user_id,name) values
 ('30000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000901','Owner project'),
 ('30000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000902','Other project');
insert into public.jobs(id,user_id,project_id,type,status,input,idempotency_key) values
 ('40000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000901',
 '30000000-0000-4000-8000-000000000901','stage_single','queued','{}','schema-job');
set local role service_role;
insert into public.credit_ledger(user_id,job_id,delta,reason,idempotency_key) values
 ('00000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901',-5,'job_reserve','schema-reserve');
update public.jobs set status='failed',error='Synthetic test' where id='40000000-0000-4000-8000-000000000901';
insert into public.credit_ledger(user_id,job_id,delta,reason,idempotency_key) values
 ('00000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000901',5,'job_refund','schema-refund');
reset role;
select pg_temp.assert_true(public.credit_balance('00000000-0000-4000-8000-000000000901')=20
 and (select remaining=20 from public.native_credit_lots), 'Real job FK/enums and failure/refund triggers preserve native attribution');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.projects)<>1 then raise exception 'Existing owner RLS changed'; end if;
  if exists(select 1 from public.projects where id='30000000-0000-4000-8000-000000000902') then
    raise exception 'Cross-account project exposed'; end if;
  begin perform * from public.native_transactions; raise exception 'Browser enumerated native transactions';
  exception when insufficient_privilege then null; end;
  begin perform public.record_verified_native_purchase('00000000-0000-4000-8000-000000000901','SANDBOX','APP_STORE',
    'browser-fake','browser-fake','schema.pack',now()); raise exception 'Browser granted credits';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert_true(true, 'Real customer RLS isolates projects and denies privileged native billing access');

set local role service_role;
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000902','SANDBOX','PLAY_STORE',
 'schema-month-1','rc-subscription:schema-month','schema.month',now(),now()+interval '1 month');
reset role;
update private.native_commerce_settings set customer_compatibility_enabled=true;
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(
 public.get_native_automation_customers('SANDBOX','none','any')) customer
 where customer->>'id'='00000000-0000-4000-8000-000000000902'),
 'Native subscriber excluded from real-schema no-subscription automation audience');
select pg_temp.assert_true((select subscription_id is null from public.admin_customer_summary
 where id='00000000-0000-4000-8000-000000000902'), 'Original Admin view never substitutes Google IDs for Stripe IDs');

insert into public.subscriptions(id,user_id,status,price_id,plan_key,monthly_credits,current_period_start,current_period_end)
 values('sub_schema','00000000-0000-4000-8000-000000000901','active','price_test_schema','schema_month',30,now(),now()+interval '1 month');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata) values
 ('00000000-0000-4000-8000-000000000901',30,'subscription_grant','schema-stripe-grant','{"subscription_id":"sub_schema"}'),
 ('00000000-0000-4000-8000-000000000901',10,'manual_adjust','schema-web-grant','{}'),
 ('00000000-0000-4000-8000-000000000901',-45,'job_reserve','schema-mixed-reserve','{"api_hold_id":"schema-hold"}');
select pg_temp.assert_true((select subscription_credit_balance=0 from public.subscriptions where id='sub_schema')
 and (select remaining=15 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000901'),
 'Real schema consumes Stripe then web credits before native credits');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata) values
 ('00000000-0000-4000-8000-000000000901',45,'job_refund','schema-mixed-refund','{"api_hold_id":"schema-hold"}');
select pg_temp.assert_true((select subscription_credit_balance=30 from public.subscriptions where id='sub_schema')
 and (select remaining=20 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000901')
 and public.credit_balance('00000000-0000-4000-8000-000000000901')=60,
 'Mixed-source failed-job refund restores all three original balances');
select public.expire_subscription_credits('00000000-0000-4000-8000-000000000901','sub_schema','schema-expiry','subscription_ended');
select pg_temp.assert_true(public.credit_balance('00000000-0000-4000-8000-000000000901')=30
 and (select remaining=20 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000901'),
 'Existing Stripe expiry leaves native and non-expiring web credits intact');

-- A paid transaction can arrive after trial creation but before phone completion.
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000903','schema-pending@example.invalid');
insert into public.trial_entitlements(user_id,state,successful_output_limit,attempt_limit,unlock_credits,allowed_service_slugs)
 values('00000000-0000-4000-8000-000000000903','pending_phone',3,6,5,array['stage','twilight']);
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000903','SANDBOX','APP_STORE',
 'schema-pending-1','rc-purchase:schema-pending-1','schema.pack',now());
select pg_temp.assert_true(public.credit_balance('00000000-0000-4000-8000-000000000903')=20
 and (select phone_verification_required from public.profiles where id='00000000-0000-4000-8000-000000000903'),
 'Paid purchase recovery while phone is pending grants credits without bypassing verification');
select pg_temp.assert_true((select state='converted' and starts_at is null and expires_at is null
 and converted_at is not null and conversion_source='native_purchase' from public.trial_entitlements
 where user_id='00000000-0000-4000-8000-000000000903'), 'Native conversion never fabricates trial dates');
do $$ begin
  begin
    update public.trial_entitlements set state='active' where user_id='00000000-0000-4000-8000-000000000903';
    raise exception 'Active trial accepted without dates';
  exception when check_violation then null; end;
  begin
    update public.trial_entitlements set conversion_source='stripe' where user_id='00000000-0000-4000-8000-000000000903';
    raise exception 'Native exception changed the Stripe date rule';
  exception when check_violation then null; end;
  begin
    update public.trial_entitlements set conversion_source=null where user_id='00000000-0000-4000-8000-000000000903';
    raise exception 'NULL conversion source bypassed the date rule';
  exception when check_violation then null; end;
  begin
    update public.trial_entitlements set expires_at=now()+interval '1 day' where user_id='00000000-0000-4000-8000-000000000903';
    raise exception 'Half-populated trial dates accepted';
  exception when check_violation then null; end;
  begin
    update public.trial_entitlements set converted_at=null where user_id='00000000-0000-4000-8000-000000000903';
    raise exception 'Undated native conversion accepted';
  exception when check_violation then null; end;
end $$;
select pg_temp.assert_true(true, 'Existing date validation stays strict outside the exact native conversion state');
\o
select 'PASS: '||label from pg_temp.schema_acceptance_passes;
select count(*)||' full application-schema checks passed.' from pg_temp.schema_acceptance_passes;
rollback;
