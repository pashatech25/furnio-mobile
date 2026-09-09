do $$
declare
  event jsonb; verified jsonb; reply jsonb; u uuid := '00000000-0000-4000-8000-000000000008';
  stamp bigint := (extract(epoch from now())*1000)::bigint;
begin
  event := jsonb_build_object('id','event-eight','app_user_id',u,'original_app_user_id',u,'environment','SANDBOX',
    'store','APP_STORE','is_family_share',false,'product_id','pack20','transaction_id','event-txn8',
    'original_transaction_id','store-original8','purchased_at_ms',stamp,'event_timestamp_ms',stamp,
    'subscriber_attributes',jsonb_build_object('email','must-not-persist@example.invalid'));
  reply := public.accept_verified_native_webhook(event,repeat('a',64));
  perform public.test_assert(reply ->> 'state'='pending','Native event is durably pending before queue delivery');
  perform public.test_assert((select not(e.event ? 'subscriber_attributes') from public.native_purchase_events e where id='event-eight'),'Subscriber PII not persisted');
  verified := jsonb_build_object('purchase',jsonb_build_object('userId',u,'environment','SANDBOX','store','APP_STORE',
    'transactionId','event-txn8','familyId','rc-purchase:purchase8','productId','pack20',
    'purchasedAt',to_timestamp(stamp::numeric/1000),'periodEnd',null,'priceAmount',29.99,'currency','CAD'),
    'grant',true,'refund',true,'subscription',null);
  -- Received a refund before original purchase webhook. Grant and recovery happen
  -- within ONE transaction, with a zero final spendable balance.
  perform public.apply_verified_native_event('event-eight',verified);
  perform public.test_assert(public.credit_balance(u)=0,'Out-of-order refund creates no spendable window');
  perform public.test_assert((select e.state='completed' from public.native_purchase_events e where id='event-eight'),'Atomic event marked complete');
  reply := public.apply_verified_native_event('event-eight',verified);
  perform public.test_assert((reply ->> 'duplicate')::boolean,'Duplicate event does not repeat accounting');
  perform public.test_assert((select count(*)=1 from public.native_transactions where user_id=u),'One store transaction retained');
  begin
    perform public.accept_verified_native_webhook(event,repeat('b',64));
    raise exception 'Event ID conflict accepted';
  exception when unique_violation then null; end;

  -- Validation failure cannot partially grant or acknowledge an event.
  event := event || jsonb_build_object('id','event-invalid','transaction_id','invalid-txn');
  perform public.accept_verified_native_webhook(event,repeat('c',64));
  begin
    perform public.apply_verified_native_event('event-invalid',verified);
    raise exception 'Mismatched verification accepted';
  exception when insufficient_privilege then null; end;
  perform public.test_assert((select e.state='pending' from public.native_purchase_events e where id='event-invalid'),'Failed event remains pending');
  perform public.test_assert(public.credit_balance(u)=0,'Rejected event did not grant');
  perform public.note_native_purchase_event_failure('event-invalid','identity_or_product_review',true);
  perform public.test_assert((select e.state='quarantined' from public.native_purchase_events e where id='event-invalid'),'Ambiguous event held for Admin review');
end $$;
select public.test_assert(not has_function_privilege('authenticated','public.apply_verified_native_event(text,jsonb)','EXECUTE'),'Customer cannot submit verified event claims');

-- A store trial is a subscription state, NOT a paid monthly credit grant. An old
-- event replay must not turn a canceled subscription back to automatic renewal.
do $$
declare event jsonb; verified jsonb; stamp bigint := (extract(epoch from now())*1000)::bigint;
  u uuid := '00000000-0000-4000-8000-000000000009';
begin
  event := jsonb_build_object('id','event-trial9','app_user_id',u,'original_app_user_id',u,'environment','SANDBOX',
    'store','PLAY_STORE','is_family_share',false,'product_id','monthly50','transaction_id','trial-txn9',
    'purchased_at_ms',stamp,'event_timestamp_ms',stamp);
  perform public.accept_verified_native_webhook(event,repeat('d',64));
  verified := jsonb_build_object('purchase',jsonb_build_object('userId',u,'environment','SANDBOX','store','PLAY_STORE',
    'transactionId','trial-txn9','familyId','rc-subscription:subscription9','productId','monthly50',
    'purchasedAt',to_timestamp(stamp::numeric/1000),'periodEnd',now()+interval '7 days'),
    'grant',false,'refund',false,'subscription',jsonb_build_object('productId','monthly50','status','trialing',
    'periodEnd',now()+interval '7 days','cancelAtPeriodEnd',true,'verifiedAt',to_timestamp(stamp::numeric/1000)));
  perform public.apply_verified_native_event('event-trial9',verified);
  perform public.test_assert(public.credit_balance(u)=0,'Store trial has no paid credit grant');
  event := event || jsonb_build_object('id','older-event9','event_timestamp_ms',stamp-10000);
  perform public.accept_verified_native_webhook(event,repeat('e',64));
  verified := jsonb_set(verified,'{subscription,cancelAtPeriodEnd}','false');
  verified := jsonb_set(verified,'{subscription,verifiedAt}',to_jsonb(to_timestamp((stamp-10000)::numeric/1000)));
  perform public.apply_verified_native_event('older-event9',verified);
  perform public.test_assert((select cancel_at_period_end from public.native_subscriptions where user_id=u),'Older event cannot overwrite newer subscription state');
end $$;
