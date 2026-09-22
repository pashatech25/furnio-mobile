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
-- September 10 deliberately enabled request intake for manual completion.
-- Replaying the complete history must retain it without enabling destructive
-- cleanup or the automatic authentication fence.
select pg_temp.assert_true((select count(*)=1 and bool_and(
  review_enabled and requests_enabled and processor_ready
  and environment='PRODUCTION' and not cleanup_enabled and not auth_block_enabled
) from private.mobile_account_settings),
 'Existing deletion intake remains enabled; automatic cleanup stays disabled');

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
-- Sandbox receipts coexist with live identity without touching shared credits.
create temp table sandbox_live_ledger_before as select * from public.credit_ledger;
insert into private.native_sandbox_accounts(user_id,enabled_until,reason) values
 ('00000000-0000-4000-8000-000000000901',now()+interval '1 day','Isolated commerce acceptance test'),
 ('00000000-0000-4000-8000-000000000902',now()+interval '1 day','Cross-account rejection test');
insert into private.native_sandbox_products values ('sandbox.pack','20000000-0000-4000-8000-000000000901');
set local role service_role;
select public.record_verified_sandbox_purchase('00000000-0000-4000-8000-000000000901',
 'SANDBOX','APP_STORE','isolated-txn','sandbox.pack',now());
select public.record_verified_sandbox_purchase('00000000-0000-4000-8000-000000000901',
 'SANDBOX','APP_STORE','isolated-txn','sandbox.pack',now());
reset role;
select pg_temp.assert_true((select count(*)=1 and sum(credits)=20 from private.native_sandbox_purchases),
 'Sandbox receipt retries produce one isolated grant');
select pg_temp.assert_true(not exists(
 (select * from public.credit_ledger except select * from sandbox_live_ledger_before)
 union all (select * from sandbox_live_ledger_before except select * from public.credit_ledger)),
 'Sandbox receipts leave the entire production credit ledger unchanged');
do $$ begin
 begin
  perform public.record_verified_sandbox_purchase('00000000-0000-4000-8000-000000000902',
   'SANDBOX','APP_STORE','isolated-txn','sandbox.pack',now());
  raise exception 'Cross-account sandbox claim accepted';
 exception when unique_violation then null; end;
 begin
  perform public.record_verified_sandbox_purchase('00000000-0000-4000-8000-000000000901',
   'PRODUCTION','APP_STORE','wrong-environment','sandbox.pack',now());
  raise exception 'Real purchase accepted by sandbox ledger';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.record_verified_sandbox_purchase('00000000-0000-4000-8000-000000000903',
   'SANDBOX','APP_STORE','not-allowlisted','sandbox.pack',now());
  raise exception 'Non-test account received sandbox credits';
 exception when insufficient_privilege then null; end;
end $$;
select pg_temp.assert_true(true,'Sandbox rejects foreign owners, production receipts and non-test accounts');
select pg_temp.assert_true(
 not has_function_privilege('authenticated','public.record_verified_sandbox_purchase(uuid,text,text,text,text,timestamptz)','EXECUTE')
 and not has_table_privilege('service_role','private.native_sandbox_accounts','INSERT')
 and not has_table_privilege('authenticated','private.native_sandbox_purchases','SELECT'),
 'Clients cannot mint/read sandbox purchases; Worker cannot enroll test accounts');
insert into public.jobs(id,user_id,type,status,input,idempotency_key) values
 ('40000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000901','stage_single','queued','{}','sandbox-job-1'),
 ('40000000-0000-4000-8000-000000000912','00000000-0000-4000-8000-000000000901','stage_single','queued','{}','sandbox-job-2');
select public.reserve_native_sandbox_job('00000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000911',15);
select public.reserve_native_sandbox_job('00000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000911',15);
select pg_temp.assert_true((select sum(credits)=15 from private.native_sandbox_allocations),'Repeated sandbox reservation debits once');
do $$ begin
 begin
  insert into public.credit_ledger(user_id,delta,reason,job_id,idempotency_key,metadata) values
   ('00000000-0000-4000-8000-000000000901',15,'job_refund',
    '40000000-0000-4000-8000-000000000911','sandbox-refund-must-not-mint','{}');
  raise exception 'Synthetic job refund minted real credits';
 exception when check_violation then
  if sqlerrm<>'Sandbox job cannot change real credit ledger' then raise; end if;
 end;
end $$;
select pg_temp.assert_true(true,'Old job handlers cannot restore sandbox spending into real credits');
select pg_temp.assert_true(public.get_native_sandbox_balance('00000000-0000-4000-8000-000000000901')=5,
 'Sandbox balance subtracts reservations without combining real credits');
select pg_temp.assert_true(public.get_native_sandbox_balance('00000000-0000-4000-8000-000000000903') is null,
 'Normal customers are distinguished from zero-balance test accounts');
update private.native_sandbox_accounts set enabled_until=now()-interval '1 second'
 where user_id='00000000-0000-4000-8000-000000000901';
select pg_temp.assert_true(public.get_native_sandbox_balance('00000000-0000-4000-8000-000000000901')=0,
 'Expired test enrollment cannot fall back to real-credit spending');
update private.native_sandbox_accounts set enabled_until=now()+interval '1 day'
 where user_id='00000000-0000-4000-8000-000000000901';
select pg_temp.assert_true(
 not has_function_privilege('anon','public.get_native_sandbox_balance(uuid)','EXECUTE')
 and not has_function_privilege('authenticated','public.get_native_sandbox_balance(uuid)','EXECUTE'),
 'Sandbox balance cannot be queried directly by clients');
do $$ begin
 begin
  perform public.reserve_native_sandbox_job('00000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000912',6);
  raise exception 'Sandbox overspend accepted';
 exception when sqlstate 'P0001' then
  if sqlerrm<>'Insufficient sandbox credits' then raise; end if;
 end;
 begin
  perform public.refund_native_sandbox_job('00000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000911');
  raise exception 'Queued sandbox job refunded';
 exception when insufficient_privilege then null; end;
end $$;
select public.refund_verified_sandbox_purchase('00000000-0000-4000-8000-000000000901','isolated-txn');
update public.jobs set status='failed' where id='40000000-0000-4000-8000-000000000911';
select public.refund_native_sandbox_job('00000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000911');
do $$ begin
 begin
  perform public.reserve_native_sandbox_job('00000000-0000-4000-8000-000000000901','40000000-0000-4000-8000-000000000912',1);
  raise exception 'Refunded store credits restored by job failure';
 exception when sqlstate 'P0001' then
  if sqlerrm<>'Insufficient sandbox credits' then raise; end if;
 end;
end $$;
select pg_temp.assert_true(not exists(select 1 from private.native_sandbox_reservations where job_id='40000000-0000-4000-8000-000000000912'),
 'Overspend rolls back reservation and store refunds cannot be resurrected');
select pg_temp.assert_true(not exists(
 (select * from public.credit_ledger except select * from sandbox_live_ledger_before)
 union all (select * from sandbox_live_ledger_before except select * from public.credit_ledger)),
 'Sandbox job spending and refunds leave real credits unchanged');
select pg_temp.assert_true(not exists(
 select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='private' and c.relname in
 ('native_commerce_settings','native_credit_allocations','native_refund_revisions')
 and (not c.relrowsecurity or has_table_privilege('authenticated',c.oid,'select')
  or has_table_privilege('anon',c.oid,'insert') or has_table_privilege('service_role',c.oid,'update'))),
 'Private commerce accounting uses RLS and RPC-only access');
set local role service_role;
select public.refund_verified_sandbox_purchase('00000000-0000-4000-8000-000000000901','refund-first');
select public.refund_verified_sandbox_purchase('00000000-0000-4000-8000-000000000901','refund-first');
select public.record_verified_sandbox_purchase('00000000-0000-4000-8000-000000000901',
 'SANDBOX','APP_STORE','refund-first','sandbox.pack',now());
reset role;
select pg_temp.assert_true((select refunded_at is not null from private.native_sandbox_purchases where transaction_id='refund-first')
 and public.get_native_sandbox_balance('00000000-0000-4000-8000-000000000901')=0,
 'Refund-before-purchase never creates spendable sandbox credits');
do $$ begin
 begin
  perform public.refund_verified_sandbox_purchase('00000000-0000-4000-8000-000000000902','refund-first');
  raise exception 'Foreign account claimed refund';
 exception when unique_violation then null; end;
end $$;
select pg_temp.assert_true((select count(*)=1 from private.native_sandbox_refunds where transaction_id='refund-first'),
 'Sandbox refund retries are idempotent and reject foreign owners');
select pg_temp.assert_true(not exists(
 (select * from public.credit_ledger except select * from sandbox_live_ledger_before)
 union all (select * from sandbox_live_ledger_before except select * from public.credit_ledger)),
 'Out-of-order sandbox refunds never alter production accounting');
do $$
declare evidence jsonb:=jsonb_build_object('id','sandbox-event-first','app_user_id','00000000-0000-4000-8000-000000000901',
 'original_app_user_id','00000000-0000-4000-8000-000000000901','environment','SANDBOX','store','APP_STORE',
 'is_family_share',false,'product_id','sandbox.pack','transaction_id','refund-first');
begin
 perform public.accept_verified_sandbox_webhook(evidence,repeat('a',64));
 perform public.accept_verified_sandbox_webhook(evidence,repeat('a',64));
 begin
  perform public.accept_verified_sandbox_webhook(evidence,repeat('b',64));
  raise exception 'Different evidence overwrote sandbox event';
 exception when unique_violation then null; end;
 begin
  perform public.accept_verified_sandbox_webhook(evidence||'{"environment":"PRODUCTION"}',repeat('a',64));
  raise exception 'Production event accepted in sandbox inbox';
 exception when invalid_parameter_value then null; end;
end $$;
select pg_temp.assert_true((select count(*)=1 from private.native_sandbox_events)
 and public.get_native_sandbox_event('sandbox-event-first')->>'kind'='consumable'
 and (public.get_native_sandbox_event('sandbox-event-first')->>'refundKnown')::boolean,
 'Sandbox inbox is idempotent, environment-isolated, and preserves prior refunds');
select pg_temp.assert_true(not has_table_privilege('service_role','private.native_sandbox_events','insert')
 and not has_table_privilege('authenticated','private.native_sandbox_events','select'),
 'Sandbox inbox is available only through privileged RPCs');
select pg_temp.assert_true(public.get_native_customer_store_context('00000000-0000-4000-8000-000000000901')
 ='{"environment":"SANDBOX","enrolled":true,"active":true}'::jsonb,
 'Server enrollment selects sandbox without a client environment claim');
update private.native_sandbox_accounts set enabled_until=now()-interval '1 second'
 where user_id='00000000-0000-4000-8000-000000000901';
select pg_temp.assert_true(public.get_native_customer_store_context('00000000-0000-4000-8000-000000000901')
 ='{"environment":"SANDBOX","enrolled":true,"active":false}'::jsonb,
 'Expired sandbox enrollment never selects real-money accounting');
select pg_temp.assert_true(not has_function_privilege('authenticated',
 'public.get_native_customer_store_context(uuid)','execute') and not has_function_privilege('anon',
 'public.get_native_customer_store_context(uuid)','execute'),
 'Client identities cannot inspect or select privileged checkout context');
update private.native_sandbox_accounts set enabled_until=now()+interval '1 day'
 where user_id='00000000-0000-4000-8000-000000000901';
do $$
declare result jsonb; checkout uuid; launched timestamptz;
begin
 result:=public.manage_native_sandbox_checkout('00000000-0000-4000-8000-000000000901','begin',
  '50000000-0000-4000-8000-000000000901','sandbox.pack');
 checkout:=(result->>'intentId')::uuid;
 perform pg_temp.assert_true((result->>'allowed')::boolean and
  public.manage_native_sandbox_checkout('00000000-0000-4000-8000-000000000901','begin',
   '50000000-0000-4000-8000-000000000901','sandbox.pack')->>'intentId'=checkout::text,
  'Sandbox checkout retries reuse one selection');
 perform public.manage_native_sandbox_checkout('00000000-0000-4000-8000-000000000901','launch',p_intent=>checkout);
 perform pg_temp.assert_true(public.manage_native_sandbox_checkout('00000000-0000-4000-8000-000000000901','cancel',p_intent=>checkout)->>'status'='pending',
  'Client cancellation cannot release a launched sandbox purchase');
 perform pg_temp.assert_true(public.manage_native_sandbox_checkout('00000000-0000-4000-8000-000000000901','report',
  p_intent=>checkout,p_hint=>'checkout-verified')->>'status'='pending',
  'Client transaction hint alone never grants or verifies a purchase');
 select launched_at into launched from private.native_sandbox_intents where id=checkout;
 perform public.record_verified_sandbox_purchase('00000000-0000-4000-8000-000000000901','SANDBOX','APP_STORE',
  'checkout-verified','sandbox.pack',launched);
 perform pg_temp.assert_true((select state='verified' and verified_transaction='checkout-verified'
  from private.native_sandbox_intents where id=checkout),
  'Verified sandbox receipt atomically settles its exact checkout intent');
 perform pg_temp.assert_true(public.manage_native_sandbox_checkout('00000000-0000-4000-8000-000000000901','read',
  p_intent=>checkout)->>'status'='verified', 'Server-verified sandbox receipt settles only its owned matching intent');
 begin
  perform public.manage_native_sandbox_checkout('00000000-0000-4000-8000-000000000902','read',p_intent=>checkout);
  raise exception 'Foreign checkout exposed';
 exception when insufficient_privilege then null; end;
 perform pg_temp.assert_true(true,'Sandbox checkout rejects cross-account access');
end $$;
select pg_temp.assert_true(not exists(
 (select * from public.credit_ledger except select * from sandbox_live_ledger_before)
 union all (select * from sandbox_live_ledger_before except select * from public.credit_ledger)),
 'Sandbox checkout completion leaves real customer accounting unchanged');
select pg_temp.assert_true(public.get_customer_spendable_balance('00000000-0000-4000-8000-000000000901')=20,
 'Enrolled accounts see isolated receipt balance, never combined real credits');
select pg_temp.assert_true(public.route_native_sandbox_job('00000000-0000-4000-8000-000000000901',
 '40000000-0000-4000-8000-000000000912','reserve',5)
 and public.get_customer_spendable_balance('00000000-0000-4000-8000-000000000901')=15,
 'Sandbox job routing reserves only isolated credits');
select pg_temp.assert_true(public.route_native_sandbox_job('00000000-0000-4000-8000-000000000901',
 '40000000-0000-4000-8000-000000000912','commit',5)
 and public.get_customer_spendable_balance('00000000-0000-4000-8000-000000000901')=15,
 'Sandbox commit does not double debit');
select pg_temp.assert_true(not public.route_native_sandbox_job('00000000-0000-4000-8000-000000000901',
 '40000000-0000-4000-8000-000000000901','refund',5),
 'A real-money reservation remains real-money after later sandbox enrollment');
update public.jobs set status='failed' where id='40000000-0000-4000-8000-000000000912';
select pg_temp.assert_true(public.route_native_sandbox_job('00000000-0000-4000-8000-000000000901',
 '40000000-0000-4000-8000-000000000912','refund',5)
 and public.get_customer_spendable_balance('00000000-0000-4000-8000-000000000901')=20,
 'Failed sandbox jobs restore only their isolated allocation');
select pg_temp.assert_true(not exists(
 (select * from public.credit_ledger except select * from sandbox_live_ledger_before)
 union all (select * from sandbox_live_ledger_before except select * from public.credit_ledger)),
 'Entire sandbox job lifecycle leaves the real customer ledger unchanged');
do $$
declare started jsonb; claimed jsonb; run uuid; lease uuid;
begin
 started:=public.begin_sandbox_purchase_recovery('00000000-0000-4000-8000-000000000902','SANDBOX');
 run:=(started->>'runId')::uuid;
 perform pg_temp.assert_true((started->>'enqueue')::boolean and
  not (public.begin_sandbox_purchase_recovery('00000000-0000-4000-8000-000000000902','SANDBOX')->>'enqueue')::boolean,
  'Repeated sandbox restore taps reuse one coordinator');
 claimed:=public.claim_sandbox_purchase_recovery(run); lease:=(claimed->>'leaseId')::uuid;
 begin
  perform public.save_sandbox_recovery_page(run,gen_random_uuid(),'[]',null,0);
  raise exception 'Stale recovery lease accepted';
 exception when object_not_in_prerequisite_state then null; end;
 perform public.save_sandbox_recovery_page(run,lease,'[]',null,0);
 claimed:=public.claim_sandbox_purchase_recovery(run);
 perform pg_temp.assert_true(claimed->>'phase'='dispatching' and claimed->'eventIds'='[]'::jsonb,
  'Sandbox restore completes discovery before dispatch');
 perform public.finish_sandbox_recovery_dispatch(run,(claimed->>'leaseId')::uuid,null);
 perform pg_temp.assert_true(public.get_sandbox_recovery_status('00000000-0000-4000-8000-000000000902','SANDBOX')->>'status'='no_purchases_found',
  'Empty verified sandbox history returns no purchases, not synthetic credits');
 begin
  perform public.begin_sandbox_purchase_recovery('00000000-0000-4000-8000-000000000902','PRODUCTION');
  raise exception 'Production restore accepted by sandbox';
 exception when object_not_in_prerequisite_state then null; end;
 perform pg_temp.assert_true(true,'Sandbox restore rejects production environment');
end $$;
\o
select 'PASS: '||label from pg_temp.schema_acceptance_passes;
select count(*)||' full application-schema checks passed.' from pg_temp.schema_acceptance_passes;
rollback;
