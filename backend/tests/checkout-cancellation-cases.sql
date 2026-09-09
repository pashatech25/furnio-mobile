begin;
insert into public.profiles(id) values('00000000-0000-4000-8000-000000000320'),('00000000-0000-4000-8000-000000000321');
do $$
declare u uuid:='00000000-0000-4000-8000-000000000320'; other_user uuid:='00000000-0000-4000-8000-000000000321';
  intent uuid; next_intent uuid; claim jsonb; before_balance integer;
begin
  update private.native_commerce_settings set checkout_protection_enabled=true,customer_compatibility_enabled=true,acquisition_enabled=true;
  insert into public.native_product_availability(product_version_id,available) select id,true from public.native_product_versions on conflict(product_version_id) do update set available=true;
  intent:=(public.begin_customer_purchase_intent(u,'SANDBOX','APP_STORE','pack20',gen_random_uuid(),repeat('a',64))->>'intentId')::uuid;
  perform public.launch_customer_purchase_intent(u,'SANDBOX',intent,'APP_STORE');
  perform public.test_assert(public.claim_native_checkout_cancellation(u,'SANDBOX',intent) is null,'independent recovery flag defaults off');
  update private.native_commerce_settings set sdk_cancellation_recovery_enabled=true;
  begin perform public.claim_native_checkout_cancellation(other_user,'SANDBOX',intent);raise exception 'cross-account claim accepted';exception when sqlstate '42501' then null;end;
  perform public.test_assert(public.claim_native_checkout_cancellation(u,'PRODUCTION',intent) is null,'wrong environment cannot claim');
  claim:=public.claim_native_checkout_cancellation(u,'SANDBOX',intent);
  perform public.test_assert(claim->>'store'='APP_STORE' and claim->>'kind'='consumable','context comes from owned immutable intent');
  perform public.test_assert(public.claim_native_checkout_cancellation(u,'SANDBOX',intent) is null,'one active verification lease per checkout');
  perform public.test_assert(not public.finish_native_checkout_cancellation(u,'SANDBOX',intent,gen_random_uuid(),'clear_snapshot'),'wrong lease cannot clear');
  perform public.test_assert(not public.finish_native_checkout_cancellation(u,'SANDBOX',intent,(claim->>'leaseId')::uuid,'unavailable'),'failed verification keeps lock');
  perform public.test_assert(public.read_native_purchase_intent(u,'SANDBOX',intent)->>'status'='pending','unknown still pending');
  perform public.test_assert(public.claim_native_checkout_cancellation(u,'SANDBOX',intent) is null,'finished attempts have a bounded cooldown');
  update private.native_checkout_cancellation_checks set next_attempt_at=clock_timestamp()-interval '1 second' where intent_id=intent;
  claim:=public.claim_native_checkout_cancellation(u,'SANDBOX',intent);
  before_balance:=public.credit_balance(u);
  update private.native_commerce_settings set acquisition_enabled=false;
  perform public.test_assert(public.finish_native_checkout_cancellation(u,'SANDBOX',intent,(claim->>'leaseId')::uuid,'clear_snapshot'),'cancel recovery works while acquisition rolled back');
  perform public.test_assert(public.read_native_purchase_intent(u,'SANDBOX',intent)->>'status'='cancelled','selection released');
  perform public.test_assert(public.credit_balance(u)=before_balance,'cancellation never changes credits');
  perform public.test_assert(not public.finish_native_checkout_cancellation(u,'SANDBOX',intent,(claim->>'leaseId')::uuid,'clear_snapshot'),'duplicate check cannot mutate audit');
  perform public.test_assert((select released_at is not null and attempts=2 from private.native_checkout_cancellation_checks where intent_id=intent),'release decision is retained');
  update private.native_commerce_settings set acquisition_enabled=true;
  next_intent:=(public.begin_customer_purchase_intent(u,'SANDBOX','APP_STORE','pack20',gen_random_uuid(),repeat('a',64))->>'intentId')::uuid;
  perform public.test_assert(next_intent is not null and next_intent<>intent,'new explicit selection can reserve without reopening old sheet');
  perform public.launch_customer_purchase_intent(u,'SANDBOX',next_intent,'APP_STORE');
  claim:=public.claim_native_checkout_cancellation(u,'SANDBOX',next_intent);
  -- A verified payment arriving after the earlier cancellation is NEVER lost.
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','cancel-late','cancel-late','pack20',
    (select launched_at from private.customer_purchase_intents where id=intent));
  update public.native_transactions set verified_at=clock_timestamp() where store_transaction_id='cancel-late';
  perform public.test_assert(public.credit_balance(u)=before_balance+20,'late paid grant stays independent of cancelled selection');
  perform public.test_assert(not public.finish_native_checkout_cancellation(u,'SANDBOX',next_intent,(claim->>'leaseId')::uuid,'clear_snapshot'),'payment racing provider snapshot prevents release');
  perform public.test_assert(public.read_native_purchase_intent(u,'SANDBOX',next_intent)->>'status'='pending','new checkout retained for exact reconciliation');
  begin perform public.get_native_checkout_cancellation_alerts(u,u);raise exception 'customer read audit';exception when sqlstate '42501' then null;end;
  insert into public.profiles(id) values('00000000-0000-4000-8000-000000000322');
  insert into public.admin_users(user_id,role) values('00000000-0000-4000-8000-000000000322','support');
  claim:=public.get_native_checkout_cancellation_alerts('00000000-0000-4000-8000-000000000322',u);
  perform public.test_assert(jsonb_array_length(claim)=1 and claim#>>'{0,intentId}'=intent::text,'late verified payment visible to read-only support');
  perform public.test_assert(claim::text not like '%cancel-late%' and claim::text not like '%store_transaction_id%','alerts expose no store receipt identifiers');
  perform public.test_assert(public.get_native_checkout_cancellation_alerts('00000000-0000-4000-8000-000000000322',other_user)='[]'::jsonb,'no cross-account audit rows');

  -- A newly received (not yet financially processed) event also prevents release.
  intent:=(public.begin_customer_purchase_intent(other_user,'SANDBOX','APP_STORE','pack20',gen_random_uuid(),repeat('b',64))->>'intentId')::uuid;
  perform public.launch_customer_purchase_intent(other_user,'SANDBOX',intent,'APP_STORE');
  claim:=public.claim_native_checkout_cancellation(other_user,'SANDBOX',intent);
  insert into public.native_purchase_events(id,user_id,environment,body_hash,event) values('cancel-inbox',other_user,'SANDBOX',repeat('a',64),
    jsonb_build_object('store','APP_STORE','product_id','pack20','purchased_at_ms',extract(epoch from clock_timestamp())*1000));
  perform public.test_assert(not public.finish_native_checkout_cancellation(other_user,'SANDBOX',intent,(claim->>'leaseId')::uuid,'clear_snapshot'),'inbox arrival blocks release');
  perform public.test_assert((select last_observation='database_conflict' from private.native_checkout_cancellation_checks where intent_id=intent),'database conflict audited without raw provider data');
  perform public.test_assert(not has_table_privilege('service_role','private.native_checkout_cancellation_checks','DELETE'),'service cannot delete cancellation checks');
  perform public.test_assert(not has_function_privilege('authenticated','public.finish_native_checkout_cancellation(uuid,text,uuid,uuid,text)','EXECUTE'),'customer cannot forge clear server snapshot');
  perform public.test_assert(not has_function_privilege('anon','public.claim_native_checkout_cancellation(uuid,text,uuid)','EXECUTE'),'anonymous cannot claim');
end; $$;
rollback;
