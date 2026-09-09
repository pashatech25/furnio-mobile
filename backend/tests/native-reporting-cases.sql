-- Synthetic records only. This entire test is rolled back.
begin;
insert into public.profiles(id) values('00000000-0000-4000-8000-000000000401');
insert into public.admin_users(user_id,role) values('00000000-0000-4000-8000-000000000001','owner');
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001'; u uuid:='00000000-0000-4000-8000-000000000401';
  baseline jsonb; report jsonb; groups jsonb; i integer; other_user uuid; ledger_count bigint;
begin
  perform public.test_assert(public.get_native_admin_reporting(actor) is null,'Reporting defaults off');
  begin perform public.get_native_admin_reporting(u);raise exception 'Customer read global finances';exception when sqlstate '42501' then null;end;
  update private.native_commerce_settings set reporting_enabled=true,customer_compatibility_enabled=true;
  baseline:=public.get_native_admin_reporting(actor);
  perform public.test_assert(baseline->>'environment'='SANDBOX','Report is visibly environment-bound');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','report-usd','report-usd','pack20',now()-interval '1 hour',null,2.50,'USD');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','report-cad','report-cad','pack20',now()-interval '2 hours',null,4.25,'CAD');
  perform public.record_verified_native_purchase(u,'SANDBOX','PLAY_STORE','report-play','rc-subscription:report-play','monthly50',now()-interval '3 hours',now()+interval '1 month',5.75,'CAD');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','report-free','report-free','pack20',now()-interval '4 hours',null,0,'USD');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','report-unknown','report-unknown','pack20',now()-interval '5 hours');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','report-old','report-old','pack20',now()-interval '31 days',null,500,'USD');
  -- Store verification tolerates five minutes of clock skew, while reporting
  -- still excludes a transaction whose purchase time is after its snapshot.
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','report-future','report-future','pack20',now()+interval '3 minutes',null,500,'USD');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','report-usd','report-usd','pack20',now()-interval '1 hour',null,2.50,'USD');
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((report#>>'{purchases,count}')::int-(baseline#>>'{purchases,count}')::int=5,'Unique transaction cohort excludes old/future purchases and duplicate delivery');
  perform public.test_assert((report#>>'{purchases,unpriced}')::int-(baseline#>>'{purchases,unpriced}')::int=1,'Unknown amount counted separately, zero remains priced');
  for groups in select * from jsonb_array_elements(report#>'{purchases,groups}') loop
    if groups->>'provider'='app_store' and groups->>'currency'='USD' then
      perform public.test_assert((groups->>'amount')::numeric-coalesce((select (x->>'amount')::numeric from jsonb_array_elements(baseline#>'{purchases,groups}') x where x->>'provider'='app_store' and x->>'currency'='USD'),0)=2.50,'USD exact; no currency mixing or unknown price inference');
    elsif groups->>'provider'='app_store' and groups->>'currency'='CAD' then
      perform public.test_assert((groups->>'amount')::numeric-coalesce((select (x->>'amount')::numeric from jsonb_array_elements(baseline#>'{purchases,groups}') x where x->>'provider'='app_store' and x->>'currency'='CAD'),0)=4.25,'Apple CAD separate');
    elsif groups->>'provider'='play_store' and groups->>'currency'='CAD' then
      perform public.test_assert((groups->>'amount')::numeric-coalesce((select (x->>'amount')::numeric from jsonb_array_elements(baseline#>'{purchases,groups}') x where x->>'provider'='play_store' and x->>'currency'='CAD'),0)=5.75,'Google CAD separate');
    end if;
  end loop;
  perform public.record_verified_native_refund('SANDBOX','APP_STORE','report-cad');
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((select (x->>'refundedAmount')::numeric from jsonb_array_elements(report#>'{purchases,groups}') x where x->>'provider'='app_store' and x->>'currency'='CAD')-
    coalesce((select (x->>'refundedAmount')::numeric from jsonb_array_elements(baseline#>'{purchases,groups}') x where x->>'provider'='app_store' and x->>'currency'='CAD'),0)=4.25,'Current cohort refund tracked separately');
  perform public.test_assert((select (x->>'active')::int from jsonb_array_elements(report->'subscriptions') x where x->>'provider'='play_store')>=1,'Unelapsed active subscription counted');
  update public.native_subscriptions set current_period_end=now()-interval '5 minutes' where user_id=u;
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((select (x->>'elapsed')::int from jsonb_array_elements(report->'subscriptions') x where x->>'provider'='play_store')>=1,'Elapsed period is not silently current');
  perform public.test_assert(exists(select 1 from jsonb_array_elements(report#>'{followUp,customers}') x where x->>'userId'=u::text and x->>'staleSubscriptions'='1'),'Period follow-up points at its owner');
  update public.native_subscriptions set current_period_end=now()+interval '1 month',status='grace_period',cancel_at_period_end=true where user_id=u;
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((select (x->>'gracePeriod')::int from jsonb_array_elements(report->'subscriptions') x where x->>'provider'='play_store')>=1,'Grace distinct from active');
  perform public.test_assert((select (x->>'cancelling')::int from jsonb_array_elements(report->'subscriptions') x where x->>'provider'='play_store')>=1,'Scheduled cancellation does not erase current access');
  update public.native_subscriptions set status='trialing' where user_id=u;
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((select (x->>'trialing')::int from jsonb_array_elements(report->'subscriptions') x where x->>'provider'='play_store')>=1,'Trial not labelled paid');
  update public.native_subscriptions set status='billing_retry' where user_id=u;
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((select (x->>'billingRetry')::int from jsonb_array_elements(report->'subscriptions') x where x->>'provider'='play_store')>=1,'Billing retry has distinct status');
  update public.native_subscriptions set status='expired' where user_id=u;
  -- Wrong-environment data can only be inserted by this test's superuser;
  -- normal verification has its own environment gate. It must not enter reports.
  insert into public.native_product_versions(environment,store,product_id,package_version_id)
    values('PRODUCTION','APP_STORE','report-production','20000000-0000-4000-8000-000000000001');
  insert into public.native_transactions(user_id,environment,store,store_transaction_id,purchase_family_id,product_version_id,purchased_at,price_amount,currency)
    select u,'PRODUCTION','APP_STORE','report-prod-txn','report-prod-txn',id,now()-interval '1 hour',999999,'USD'
      from public.native_product_versions where environment='PRODUCTION' and product_id='report-production';
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((report#>>'{purchases,count}')::int-(baseline#>>'{purchases,count}')::int=5,'Other environment cannot enter totals');
  for i in 1..61 loop
    other_user:=gen_random_uuid(); insert into public.profiles(id) values(other_user);
    insert into public.native_purchase_events(id,user_id,environment,body_hash,event,state,received_at)
      values('report-event-'||i,other_user,'SANDBOX',repeat('a',64),'{}','quarantined',now()-interval '2 days');
  end loop;
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert(jsonb_array_length(report#>'{followUp,customers}')=50,'Follow-up page bounded');
  perform public.test_assert((report#>>'{followUp,totalAccounts}')::int>=61,'Totals not truncated to page');
  perform public.test_assert(jsonb_array_length(public.get_native_admin_reporting(actor,50)#>'{followUp,customers}')>=11,'Remaining customers reachable');
  perform public.test_assert(not exists(select 1 from jsonb_array_elements(report#>'{followUp,customers}') a join jsonb_array_elements(public.get_native_admin_reporting(actor,50)#>'{followUp,customers}') b on a->>'userId'=b->>'userId'),'Stable ordering avoids duplicate page rows in one snapshot');
  perform public.test_assert(report::text not like '%report-event-%' and report::text not like '%body_hash%' and report::text not like '%report-usd%','Report excludes receipts/event bodies/external identifiers');
  begin perform public.get_native_admin_reporting(actor,-1);raise exception 'Negative offset';exception when sqlstate '22023' then null;end;
  begin perform public.get_native_admin_reporting(actor,1000001);raise exception 'Huge offset';exception when sqlstate '22023' then null;end;
  update private.native_commerce_settings set customer_compatibility_enabled=false;
  perform public.test_assert(public.get_native_admin_reporting(actor) is null,'Compatibility independently gates report');
  update public.admin_users set is_active=false where user_id=actor;
  begin perform public.get_native_admin_reporting(actor);raise exception 'Inactive Admin';exception when sqlstate '42501' then null;end;
  perform public.test_assert(not has_function_privilege('anon','public.get_native_admin_reporting(uuid,integer)','execute') and not has_function_privilege('authenticated','public.get_native_admin_reporting(uuid,integer)','execute'),'Customers cannot forge actor UUID');
  perform public.test_assert(has_function_privilege('service_role','public.get_native_admin_reporting(uuid,integer)','execute'),'Private server may execute report');
  update public.admin_users set is_active=true where user_id=actor;
  update private.native_commerce_settings set customer_compatibility_enabled=true;
  select count(*) into ledger_count from public.credit_ledger;
  perform public.get_native_admin_reporting(actor);
  perform public.test_assert((select count(*) from public.credit_ledger)=ledger_count,'Reporting never changes the shared ledger');
end; $$;
rollback;
