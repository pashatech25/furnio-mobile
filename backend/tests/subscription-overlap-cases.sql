-- Local synthetic PostgreSQL fixture only. No subscription is changed outside
-- this rollback. The report itself must never mutate purchase/credit records.
begin;
insert into public.admin_users(user_id,role) values('00000000-0000-4000-8000-000000000001','owner');
insert into public.profiles(id) values('00000000-0000-4000-8000-000000000501');
insert into public.native_product_versions(environment,store,product_id,package_version_id)
  values('SANDBOX','APP_STORE','monthly50','20000000-0000-4000-8000-000000000002');
insert into public.billing_package_versions(id,package_id,name,interval,total_credits,max_source_photos_per_project,stripe_livemode)
  values('20000000-0000-4000-8000-000000000504','10000000-0000-4000-8000-000000000001','Production fixture','month',50,20,true);
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001'; u uuid:='00000000-0000-4000-8000-000000000501';
  report jsonb; customer jsonb; baseline bigint; original_balance integer; original_transactions bigint;
  status_value text; expected boolean;
begin
  update private.native_commerce_settings set reporting_enabled=true,customer_compatibility_enabled=true;
  report:=public.get_native_admin_reporting(actor);
  baseline:=(report#>>'{followUp,totalSignals}')::bigint;
  perform public.test_assert(report->>'reportVersion'='2','Report advertises completed overlap check');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','overlap-apple','rc-subscription:overlap-apple','monthly50',now()-interval '1 hour',now()+interval '1 month',10,'USD');
  -- A repeated webhook/transaction or a renewal in the same family is not a
  -- second obligation, even though the latter legitimately grants more credits.
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','overlap-apple','rc-subscription:overlap-apple','monthly50',now()-interval '1 hour',now()+interval '1 month',10,'USD');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','overlap-renewal','rc-subscription:overlap-apple','monthly50',now(),now()+interval '2 months',10,'USD');
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((report#>>'{followUp,totalSignals}')::bigint=baseline,'Renewal/duplicate transaction not an overlap');
  -- Apple + Google, and later two distinct Apple families, both need follow-up.
  perform public.record_verified_native_purchase(u,'SANDBOX','PLAY_STORE','overlap-google','rc-subscription:overlap-google','monthly50',now(),now()+interval '1 month',10,'CAD');
  report:=public.get_native_admin_reporting(actor);
  select x into customer from jsonb_array_elements(report#>'{followUp,customers}') x where x->>'userId'=u::text;
  perform public.test_assert(customer->>'subscriptionOverlaps'='1' and customer->>'signals'='1','Exactly one overlap signal per customer');
  perform public.test_assert(customer->'overlapSubscriptions'='{"appStore":1,"playStore":1,"stripe":0,"stripeUnknownMode":0}'::jsonb,'Exact provider counts, not transaction counts');
  update public.native_subscriptions set status='expired' where user_id=u and store='PLAY_STORE';
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','overlap-apple-two','rc-subscription:overlap-apple-two','monthly50',now(),now()+interval '1 month',10,'USD');
  report:=public.get_native_admin_reporting(actor);
  select x into customer from jsonb_array_elements(report#>'{followUp,customers}') x where x->>'userId'=u::text;
  perform public.test_assert(customer#>>'{overlapSubscriptions,appStore}'='2','Same-store distinct families are visible');
  update public.native_subscriptions set status='revoked' where user_id=u and purchase_family_id='rc-subscription:overlap-apple-two';
  insert into public.subscriptions(id,user_id,status,package_version_id)
    values('sub_overlap_fixture',u,'active','20000000-0000-4000-8000-000000000002');
  foreach status_value in array array['active','trialing','past_due','unpaid','incomplete','paused','canceled','incomplete_expired'] loop
    update public.subscriptions set status=status_value where id='sub_overlap_fixture';
    expected:=status_value not in ('canceled','incomplete_expired');
    report:=public.get_native_admin_reporting(actor);
    perform public.test_assert(exists(select 1 from jsonb_array_elements(report#>'{followUp,customers}') x
      where x->>'userId'=u::text and x->>'subscriptionOverlaps'='1')=expected,'Stripe state classification: '||status_value);
  end loop;
  update public.subscriptions set status='active',cancel_at_period_end=true where id='sub_overlap_fixture';
  foreach status_value in array array['active','trialing','grace_period','billing_retry'] loop
    update public.native_subscriptions set status=status_value,cancel_at_period_end=true where user_id=u and purchase_family_id='rc-subscription:overlap-apple';
    report:=public.get_native_admin_reporting(actor);
    select x into customer from jsonb_array_elements(report#>'{followUp,customers}') x where x->>'userId'=u::text;
    perform public.test_assert(customer#>>'{overlapSubscriptions,stripe}'='1','Native state/scheduled cancellation remains reviewable: '||status_value);
  end loop;
  update public.subscriptions set billing_context='developer' where id='sub_overlap_fixture';
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((report#>>'{followUp,totalSignals}')::bigint=baseline,'Developer plan not a duplicate customer subscription');
  update public.subscriptions set billing_context='customer',package_version_id='20000000-0000-4000-8000-000000000504' where id='sub_overlap_fixture';
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((report#>>'{followUp,totalSignals}')::bigint=baseline,'Known live Stripe subscription excluded from sandbox report');
  update public.subscriptions set package_version_id=null where id='sub_overlap_fixture';
  report:=public.get_native_admin_reporting(actor);
  select x into customer from jsonb_array_elements(report#>'{followUp,customers}') x where x->>'userId'=u::text;
  perform public.test_assert(customer#>>'{overlapSubscriptions,stripe}'='0' and customer#>>'{overlapSubscriptions,stripeUnknownMode}'='1','Unknown Stripe mode is explicit, never assumed sandbox or live');
  update public.native_subscriptions set current_period_end=now()-interval '1 minute' where user_id=u and purchase_family_id='rc-subscription:overlap-apple';
  report:=public.get_native_admin_reporting(actor);
  select x into customer from jsonb_array_elements(report#>'{followUp,customers}') x where x->>'userId'=u::text;
  perform public.test_assert(customer->>'staleSubscriptions'='1' and customer->>'subscriptionOverlaps'='0' and customer->'overlapSubscriptions'='null'::jsonb,'Elapsed native period is reconciliation, not current overlap');
  update public.native_subscriptions set status='expired' where user_id=u;
  insert into public.subscriptions(id,user_id,status) values('sub_second_stripe_fixture',u,'active');
  report:=public.get_native_admin_reporting(actor);
  perform public.test_assert((report#>>'{followUp,totalSignals}')::bigint=baseline,'Stripe-only reporting is unchanged');
  update public.native_subscriptions set status='active',current_period_end=now()+interval '1 month' where user_id=u and purchase_family_id='rc-subscription:overlap-apple';
  insert into public.native_product_versions(environment,store,product_id,package_version_id)
    values('PRODUCTION','PLAY_STORE','overlap-production','20000000-0000-4000-8000-000000000002');
  insert into public.native_subscriptions(user_id,environment,store,purchase_family_id,product_version_id,status,current_period_end,verified_at)
    select u,'PRODUCTION','PLAY_STORE','overlap-other-environment',id,'active',now()+interval '1 month',now()
    from public.native_product_versions where product_id='overlap-production';
  original_balance:=public.credit_balance(u);
  select count(*) into original_transactions from public.native_transactions where user_id=u;
  report:=public.get_native_admin_reporting(actor);
  select x into customer from jsonb_array_elements(report#>'{followUp,customers}') x where x->>'userId'=u::text;
  perform public.test_assert(customer#>>'{overlapSubscriptions,playStore}'='0','Other native environment excluded');
  perform public.test_assert(customer->>'signals'='1' and (report#>>'{followUp,totalSignals}')::bigint=baseline+1,'Three obligations still one actionable customer signal');
  perform public.test_assert(report::text not like '%sub_overlap_fixture%' and report::text not like '%rc-subscription:%' and report::text not like '%overlap-apple%','No provider identifiers, families or raw transactions disclosed');
  perform public.test_assert(public.credit_balance(u)=original_balance and (select count(*) from public.native_transactions where user_id=u)=original_transactions,'Report does not alter credits or purchases');
  perform public.test_assert((select status from public.subscriptions where id='sub_overlap_fixture')='active','Report never cancels or changes a subscription');
  update private.native_commerce_settings set reporting_enabled=false;
  perform public.test_assert(public.get_native_admin_reporting(actor) is null,'Existing reporting gate remains authoritative');
  perform public.test_assert(not has_function_privilege('anon','public.get_native_admin_reporting(uuid,integer)','execute') and
    not has_function_privilege('authenticated','public.get_native_admin_reporting(uuid,integer)','execute'),'Replacement preserves service-only access');
end $$;
rollback;
