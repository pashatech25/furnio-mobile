begin;
update private.native_commerce_settings set customer_compatibility_enabled=true;
insert into public.profiles(id,email,full_name) values
 ('00000000-0000-4000-8000-000000000051','admin-native@example.invalid','Native only fixture'),
 ('00000000-0000-4000-8000-000000000052','admin-empty@example.invalid','No subscription fixture');
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000051','SANDBOX','PLAY_STORE',
 'admin-native-txn','rc-subscription:admin-native','monthly50',now(),now()+interval '1 month',12.99,'CAD');
select public.test_assert(jsonb_array_length(public.get_native_aware_admin_customers('subscribed','admin-native'))=1,'Native-only subscriber appears in subscribed filter');
select public.test_assert(jsonb_array_length(public.get_native_aware_admin_customers('no_plan','admin-native'))=0,'Native-only subscriber is not shown as no plan');
select public.test_assert(jsonb_array_length(public.get_native_aware_admin_customers('no_plan','admin-empty'))=1,'Unsubscribed filter still works');
select public.test_assert(public.get_native_aware_admin_customers('all','admin-native')#>>'{0,native_subscriptions,0,provider}'='play_store','Admin table provider is distinct from Stripe');
select public.test_assert(public.get_native_aware_admin_customers('all','admin-native')#>>'{0,subscription_id}' is null,'Native subscription never replaces Stripe ID');
update public.native_subscriptions set status='billing_retry' where purchase_family_id='rc-subscription:admin-native';
select public.test_assert(jsonb_array_length(public.get_native_aware_admin_customers('past_due','admin-native'))=1,'Native billing issue appears in follow-up filter');
select public.test_assert(public.get_native_admin_customer_billing('00000000-0000-4000-8000-000000000051')#>>'{payments,0,currency}'='CAD','Native actual currency preserved');
select public.test_assert(public.get_native_admin_customer_billing('00000000-0000-4000-8000-000000000051')#>>'{payments,0,amount}'='12.9900','Native actual amount, no guessed Stripe catalog price');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key) values ('00000000-0000-4000-8000-000000000051',-50,'job_reserve','admin-native-spend');
select public.record_verified_native_refund('SANDBOX','PLAY_STORE','admin-native-txn');
select public.test_assert(public.get_native_admin_customer_billing('00000000-0000-4000-8000-000000000051')#>>'{alerts,0,kind}'='refund_credit_shortfall','Admin sees spent-credit refund shortfall');
select public.test_assert(public.get_native_admin_customer_billing('00000000-0000-4000-8000-000000000051')#>>'{alerts,0,credits}'='50','Shortfall amount exact');
select public.test_assert(public.get_native_admin_customer_billing('00000000-0000-4000-8000-000000000052') is null,'Details cannot leak another customer purchase');
select public.accept_verified_native_webhook(jsonb_build_object('id','admin-pending-first-purchase',
 'app_user_id','00000000-0000-4000-8000-000000000052','original_app_user_id','00000000-0000-4000-8000-000000000052',
 'environment','SANDBOX','store','PLAY_STORE','is_family_share',false,'product_id','monthly50',
 'transaction_id','admin-pending-first-txn','purchased_at_ms',(extract(epoch from now())*1000)::bigint,
 'event_timestamp_ms',(extract(epoch from now())*1000)::bigint),repeat('f',64));
select public.note_native_purchase_event_failure('admin-pending-first-purchase','identity_or_product_review',true);
select public.test_assert(public.get_native_admin_customer_billing('00000000-0000-4000-8000-000000000052')#>>'{alerts,0,state}'='quarantined','First purchase review is visible before credit or subscription exists');
select public.test_assert(public.get_native_admin_customer_billing('00000000-0000-4000-8000-000000000052')#>>'{billing,creditsRemaining}'='0','Pending purchase is never represented as granted credits');
select public.test_assert(not has_function_privilege('authenticated','public.get_native_admin_customer_billing(uuid)','execute') and
 not has_function_privilege('anon','public.get_native_aware_admin_customers(text,text)','execute'),'Native Admin RPCs are not public');
update private.native_commerce_settings set customer_compatibility_enabled=false;
select public.test_assert(public.get_native_admin_customer_billing('00000000-0000-4000-8000-000000000051') is null,'Admin details obey disabled compatibility gate');
rollback;
