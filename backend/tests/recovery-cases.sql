begin;
insert into public.profiles(id,email) values
 ('00000000-0000-4000-8000-000000000201','recovery-fixture@example.invalid'),
 ('00000000-0000-4000-8000-000000000202','recovery-review@example.invalid');
do $$
declare u uuid:='00000000-0000-4000-8000-000000000201'; run uuid; lease uuid; claim jsonb; event jsonb; refund jsonb;
  eid text:='rc-recovery:'||repeat('a',64); rid text:='rc-recovery:'||repeat('b',64); reply jsonb; verified jsonb;
  stamp bigint:=(extract(epoch from now())*1000)::bigint;
begin
  reply:=public.begin_native_purchase_recovery(u,'SANDBOX'); run:=(reply->>'runId')::uuid;
  perform public.test_assert((reply->>'enqueue')::boolean,'First restore queues a durable coordinator');
  reply:=public.begin_native_purchase_recovery(u,'SANDBOX');
  perform public.test_assert(reply->>'runId'=run::text and not (reply->>'enqueue')::boolean,'Repeated taps reuse run without queue flooding');
  claim:=public.claim_native_purchase_recovery(run); lease:=(claim->>'leaseId')::uuid;
  begin perform public.claim_native_purchase_recovery(run); raise exception 'Double lease accepted';
    exception when lock_not_available then null; end;
  event:=jsonb_build_object('id',eid,'type','NON_RENEWING_PURCHASE','app_id','app_apple','app_user_id',u,'original_app_user_id',u,
    'environment','SANDBOX','store','APP_STORE','is_family_share',false,'product_id','pack20','transaction_id','recovery-txn201',
    'original_transaction_id','recovery-txn201','purchased_at_ms',stamp,'event_timestamp_ms',stamp,
    'period_type','NORMAL','expiration_at_ms',null);
  begin
    perform public.save_native_recovery_page(run,lease,jsonb_build_array(jsonb_build_object('event',event||jsonb_build_object('app_user_id','00000000-0000-4000-8000-000000000202'),'bodyHash',repeat('a',64))),'p2',0);
    raise exception 'Other customer accepted';
  exception when insufficient_privilege then null; end;
  perform public.save_native_recovery_page(run,lease,jsonb_build_array(jsonb_build_object('event',event,'bodyHash',repeat('a',64))),'p2',0);
  perform public.test_assert(not (public.get_native_purchase_event(eid)->>'recoveryReady')::boolean,'No partial-history credit grant');
  perform public.test_assert(public.credit_balance(u)=0,'Discovery cannot grant credits');
  begin perform public.save_native_recovery_page(run,lease,'[]'::jsonb,null,0); raise exception 'Stale lease reused';
    exception when sqlstate '55000' then null; end;
  claim:=public.claim_native_purchase_recovery(run); lease:=(claim->>'leaseId')::uuid;
  perform public.test_assert(claim->>'cursor'='p2','Next message resumes durable server cursor');
  refund:=event||jsonb_build_object('id',rid,'type','CANCELLATION','cancel_reason','CUSTOMER_SUPPORT','event_timestamp_ms',stamp+1000);
  perform public.save_native_recovery_page(run,lease,jsonb_build_array(jsonb_build_object('event',refund,'bodyHash',repeat('b',64))),null,0);
  perform public.test_assert((public.get_native_purchase_event(eid)->>'refundKnown')::boolean,'Refund on later page is known before original grant');
  perform public.test_assert((public.get_native_purchase_event(eid)->>'recoveryReady')::boolean,'Dispatch only after complete compatible history');
  claim:=public.claim_native_purchase_recovery(run); lease:=(claim->>'leaseId')::uuid;
  perform public.test_assert(claim->>'phase'='dispatching' and jsonb_array_length(claim->'eventIds')=2,'Dispatch reads immutable inbox references');
  begin perform public.finish_native_recovery_dispatch(run,lease,'wrong'); raise exception 'Bad dispatch accepted';
    exception when invalid_parameter_value then null; end;
  perform public.finish_native_recovery_dispatch(run,lease,rid);
  claim:=public.claim_native_purchase_recovery(run); lease:=(claim->>'leaseId')::uuid;
  perform public.finish_native_recovery_dispatch(run,lease,null);
  perform public.test_assert(public.get_native_recovery_status(u,'SANDBOX')->>'status'='pending','Discovery complete is not falsely reported as paid');
  verified:=jsonb_build_object('purchase',jsonb_build_object('userId',u,'environment','SANDBOX','store','APP_STORE','transactionId','recovery-txn201',
    'familyId','rc-purchase:recovery201','productId','pack20','purchasedAt',to_timestamp(stamp::numeric/1000),'periodEnd',null,'priceAmount',29.99,'currency','CAD'),
    'grant',true,'refund',true,'subscription',null);
  perform public.apply_verified_native_event(eid,verified);
  perform public.apply_verified_native_event(rid,verified);
  perform public.test_assert(public.credit_balance(u)=0,'Refunded recovery never leaves credits spendable');
  -- Independently arriving original webhook: separate event ID, same purchase.
  event:=event||jsonb_build_object('id','webhook201');
  perform public.accept_verified_native_webhook(event,repeat('c',64));
  perform public.apply_verified_native_event('webhook201',verified);
  perform public.test_assert((select count(*)=1 from public.native_transactions where user_id=u),'Webhook and history cannot double-deliver purchase');
  perform public.test_assert(public.get_native_recovery_status(u,'SANDBOX')->>'status'='synchronized','Only verified completed history is synchronized');
  perform public.test_assert(public.get_native_recovery_status('00000000-0000-4000-8000-000000000202','SANDBOX')->>'status'='not_started','Status is account scoped');
end $$;
do $$
declare u uuid:='00000000-0000-4000-8000-000000000202'; run uuid; lease uuid;
begin
  run:=(public.begin_native_purchase_recovery(u,'SANDBOX')->>'runId')::uuid;
  lease:=(public.claim_native_purchase_recovery(run)->>'leaseId')::uuid;
  perform public.save_native_recovery_page(run,lease,'[]'::jsonb,null,1);
  perform public.test_assert(public.get_native_recovery_status(u,'SANDBOX')->>'status'='needs_review','Incompatible history is not guessed or silently complete');
  perform public.test_assert(public.claim_native_purchase_recovery(run) is null,'Incompatible history is not auto-dispatched');
  update private.native_commerce_settings set customer_compatibility_enabled=true;
  perform public.test_assert(public.get_native_admin_customer_billing(u)#>>'{alerts,0,kind}'='recovery_history_needs_review','Admin sees review even when zero usable purchase events exist');
  perform public.test_assert(public.get_native_admin_customer_billing('00000000-0000-4000-8000-000000000201')#>>'{alerts,0,kind}' is distinct from 'recovery_history_needs_review','Review alert cannot leak to another account');
  update private.native_commerce_settings set reconciliation_enabled=false;
  begin perform public.begin_native_purchase_recovery(u,'SANDBOX'); raise exception 'Disabled recovery accepted';
    exception when sqlstate '55000' then null; end;
end $$;
select public.test_assert(not has_function_privilege('authenticated','public.begin_native_purchase_recovery(uuid,text)','execute')
  and not has_function_privilege('anon','public.save_native_recovery_page(uuid,uuid,jsonb,text,integer)','execute')
  and not has_table_privilege('authenticated','private.native_purchase_recovery','select'),'Coordinator and paid assertions are service-role only');
rollback;

begin;
insert into public.profiles(id,email) values ('00000000-0000-4000-8000-000000000203','empty-history@example.invalid');
do $$
declare u uuid:='00000000-0000-4000-8000-000000000203'; run uuid; lease uuid;
begin
  run:=(public.begin_native_purchase_recovery(u,'SANDBOX')->>'runId')::uuid;
  update private.native_purchase_recovery set pages=499 where run_id=run;
  lease:=(public.claim_native_purchase_recovery(run)->>'leaseId')::uuid;
  perform public.save_native_recovery_page(run,lease,'[]'::jsonb,null,0);
  perform public.test_assert((select phase='dispatching' from private.native_purchase_recovery where run_id=run),'Exactly 500 complete pages can finish');
  lease:=(public.claim_native_purchase_recovery(run)->>'leaseId')::uuid;
  perform public.finish_native_recovery_dispatch(run,lease,null);
  perform public.test_assert(public.get_native_recovery_status(u,'SANDBOX')->>'status'='no_purchases_found','Empty store history is not payment-success proof');
  update private.native_purchase_recovery set completed_at=now()-interval '61 seconds' where run_id=run;
  run:=(public.begin_native_purchase_recovery(u,'SANDBOX')->>'runId')::uuid;
  update private.native_purchase_recovery set pages=499 where run_id=run;
  lease:=(public.claim_native_purchase_recovery(run)->>'leaseId')::uuid;
  perform public.save_native_recovery_page(run,lease,'[]'::jsonb,'still-more',0);
  perform public.test_assert(public.get_native_recovery_status(u,'SANDBOX')->>'status'='needs_review','Truncated history cannot dispatch automatic grants');
end $$;
rollback;
