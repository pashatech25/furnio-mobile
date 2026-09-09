begin;
insert into public.profiles(id,email) values
 ('00000000-0000-4000-8000-000000000041','native@example.invalid'),
 ('00000000-0000-4000-8000-000000000042','stripe@example.invalid'),
 ('00000000-0000-4000-8000-000000000043','empty@example.invalid');
insert into public.trial_entitlements(user_id,state) values ('00000000-0000-4000-8000-000000000041','active');
insert into public.native_product_versions(environment,store,product_id,package_version_id) values
 ('SANDBOX','APP_STORE','compat-monthly50','20000000-0000-4000-8000-000000000002');
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000041','SANDBOX','APP_STORE',
 'compat-month','rc-subscription:compat-month','compat-monthly50',now(),now()+interval '1 month');
select public.test_assert((select state='converted' and conversion_source='native_purchase' from public.trial_entitlements
 where user_id='00000000-0000-4000-8000-000000000041'),'Verified native grant converts trial using existing function');
select public.test_assert(private.resolve_project_photo_limit('00000000-0000-4000-8000-000000000041')=5,'Disabled compatibility retains original quota');
select public.test_assert(public.get_native_customer_billing('00000000-0000-4000-8000-000000000041') is null,'Disabled billing block is null');
update private.native_commerce_settings set customer_compatibility_enabled=true,acquisition_enabled=false;
select public.test_assert(private.resolve_project_photo_limit('00000000-0000-4000-8000-000000000041')=20,'Native monthly immutable photo quota');
select public.test_assert(public.get_native_customer_billing('00000000-0000-4000-8000-000000000043') is null,'Non-native users have no added UI block');
select public.test_assert((public.get_native_customer_billing('00000000-0000-4000-8000-000000000041')->>'creditsRemaining')::int=50,'Shared native credit source balance');
select public.test_assert(public.get_native_customer_billing('00000000-0000-4000-8000-000000000041')#>>'{subscriptions,0,provider}'='app_store','Correct native management provider');
select public.test_assert(public.get_native_customer_billing('00000000-0000-4000-8000-000000000041')#>>'{recentTransactions,0,documentsAvailable}'='false','No Stripe invoice retrieval for native credits');
select public.test_assert(public.get_native_customer_billing('00000000-0000-4000-8000-000000000041')::text not like '%rc-subscription%' and
 public.get_native_customer_billing('00000000-0000-4000-8000-000000000041')::text not like '%compat-month%','No RevenueCat/store transaction identifiers exposed');
update public.native_subscriptions set cancel_at_period_end=true where purchase_family_id='rc-subscription:compat-month';
select public.test_assert(private.resolve_project_photo_limit('00000000-0000-4000-8000-000000000041')=20,'Cancellation keeps quota for paid period');
update public.native_subscriptions set status='billing_retry' where purchase_family_id='rc-subscription:compat-month';
select public.test_assert(private.resolve_project_photo_limit('00000000-0000-4000-8000-000000000041')=5,'Billing retry grants no unpaid quota');
update public.native_subscriptions set status='grace_period' where purchase_family_id='rc-subscription:compat-month';
select public.test_assert(private.resolve_project_photo_limit('00000000-0000-4000-8000-000000000041')=20,'Verified unexpired grace period keeps quota');
update public.native_subscriptions set current_period_end=now()-interval '1 second' where purchase_family_id='rc-subscription:compat-month';
select public.test_assert(private.resolve_project_photo_limit('00000000-0000-4000-8000-000000000041')=5,'Late expiration webhook cannot retain native quota forever');
select public.test_assert(public.get_native_customer_billing('00000000-0000-4000-8000-000000000041')#>>'{subscriptions,0,periodElapsed}'='true','Stale period shown explicitly');
select public.test_assert(public.credit_balance('00000000-0000-4000-8000-000000000041')=50,'Elapsed subscription never expires native credits');
insert into public.subscriptions(id,user_id,status,package_version_id) values
 ('sub_compat','00000000-0000-4000-8000-000000000041','active','20000000-0000-4000-8000-000000000002'),
 ('sub_compat_web','00000000-0000-4000-8000-000000000042','past_due','20000000-0000-4000-8000-000000000002');
select public.test_assert(private.resolve_project_photo_limit('00000000-0000-4000-8000-000000000041')=20,'Stripe quota remains after native expiration');
select public.test_assert(private.resolve_project_photo_limit('00000000-0000-4000-8000-000000000042')=private.resolve_web_project_photo_limit('00000000-0000-4000-8000-000000000042'),'Existing web-only behaviour byte-for-byte fallback');
select public.test_assert(not has_function_privilege('anon','public.get_native_customer_billing(uuid)','execute') and
 not has_function_privilege('authenticated','public.get_native_customer_billing(uuid)','execute') and
 has_function_privilege('service_role','public.get_native_customer_billing(uuid)','execute'),'Only backend may supply customer UUID');
select public.test_assert(not has_function_privilege('authenticated','private.resolve_web_project_photo_limit(uuid)','execute'),'Private original resolver not exposed');
rollback;
