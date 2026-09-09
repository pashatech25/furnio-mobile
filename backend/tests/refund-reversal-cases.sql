-- Synthetic identities and server-proof fixtures ONLY. The Worker separately
-- proves these revisions from read-only RevenueCat history + owned transactions.
update private.native_commerce_settings set customer_compatibility_enabled=true;
create function public.fixture_refund_revision(p_user uuid,p_tx text,p_revision bigint,p_refunded boolean,p_event text)
returns jsonb language plpgsql as $$
declare stamp bigint := p_revision-100000; original public.native_transactions; e jsonb; v jsonb;
begin
  select * into original from public.native_transactions where store='APP_STORE' and store_transaction_id=p_tx;
  if found then stamp := (extract(epoch from original.purchased_at)*1000)::bigint; end if;
  e := jsonb_build_object('id',p_event,'type',case when p_refunded then 'CANCELLATION' else 'REFUND_REVERSED' end,
    'cancel_reason','CUSTOMER_SUPPORT','app_id','app_apple','app_user_id',p_user,'original_app_user_id',p_user,
    'environment','SANDBOX','store','APP_STORE','is_family_share',false,'period_type','NORMAL',
    'product_id','pack20','transaction_id',p_tx,'original_transaction_id',p_tx,
    'purchased_at_ms',stamp,'event_timestamp_ms',p_revision);
  perform public.accept_verified_native_webhook(e,repeat('f',64));
  v := jsonb_build_object('purchase',jsonb_build_object('userId',p_user,'environment','SANDBOX','store','APP_STORE',
    'transactionId',p_tx,'familyId','rc-purchase:'||p_tx,'productId','pack20','purchasedAt',to_timestamp(stamp::numeric/1000),
    'periodEnd',null,'priceAmount',20,'currency','USD'), 'grant',true,'refund',p_refunded,'subscription',null,
    'refundState',jsonb_build_object('refunded',p_refunded,'revisionMs',p_revision,'evidenceId','rc-recovery:'||repeat('f',64)));
  return public.apply_verified_native_event(p_event,v);
end $$;

do $$
declare u uuid := '00000000-0000-4000-8000-000000000301';
  stamp bigint := (extract(epoch from now())*1000)::bigint-10000; grant_id bigint; result jsonb;
begin
  insert into public.profiles(id) values(u);
  insert into public.jobs(id,user_id,type,status) values(u,u,'staging','processing');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','reverse301','rc-purchase:reverse301','pack20',to_timestamp((stamp-100000)::numeric/1000));
  select grant_ledger_id into grant_id from public.native_credit_lots where user_id=u;
  insert into public.subscriptions(id,user_id,status) values('sub_reverse301',u,'active');
  insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata) values
    (u,10,'subscription_grant','reverse301-stripe','{"subscription_id":"sub_reverse301"}'),
    (u,50,'manual_adjust','reverse301-web','{}');
  insert into public.credit_ledger(user_id,delta,reason,idempotency_key,job_id) values(u,-65,'job_reserve','reverse301-reserve',u);
  perform public.fixture_refund_revision(u,'reverse301',stamp,true,'reverse301-refund');
  perform public.test_assert(public.credit_balance(u)=0,'Refund recovers only remaining 15 native credits');
  perform public.test_assert((select shortfall=5 from public.native_reconciliation_alerts where user_id=u),'Reserved native credits remain audited');
  perform public.fixture_refund_revision(u,'reverse301',stamp+1000,false,'reverse301-reversal');
  perform public.test_assert(public.credit_balance(u)=15,'Reversal restores recovered 15, not full 20');
  perform public.test_assert((select remaining=15 and recovered=0 and not revoked and grant_ledger_id=grant_id from public.native_credit_lots where user_id=u),'Same FIFO lot and original grant identity retained');
  perform public.test_assert((select subscription_credit_balance=0 from public.subscriptions where id='sub_reverse301'),'Reversal does not inject into Stripe balance');
  perform public.test_assert((select shortfall=0 and resolved_at is not null from public.native_reconciliation_alerts where user_id=u),'Reversal resolves spent-credit shortfall');
  insert into public.credit_ledger(user_id,delta,reason,idempotency_key,job_id) values(u,65,'job_refund','reverse301-job-refund',u);
  perform public.test_assert(public.credit_balance(u)=80,'Later failed job restores original Stripe, web and native sources');
  perform public.test_assert((select remaining=20 and recovered=0 from public.native_credit_lots where user_id=u),'No double-credit on later job return');
  perform public.fixture_refund_revision(u,'reverse301',stamp,true,'reverse301-delayed-refund');
  perform public.fixture_refund_revision(u,'reverse301',stamp+1000,false,'reverse301-duplicate-reversal');
  perform public.test_assert(public.credit_balance(u)=80,'Delayed old refund and duplicate reversal cannot change balance');
  begin
    perform public.record_verified_native_refund('SANDBOX','APP_STORE','reverse301');
    raise exception 'Unversioned refund bypass accepted';
  exception when object_not_in_prerequisite_state then null; end;
  perform public.fixture_refund_revision(u,'reverse301',stamp+2000,true,'reverse301-new-refund');
  perform public.test_assert(public.credit_balance(u)=60,'Second genuine refund recovers only native credits');
  perform public.fixture_refund_revision(u,'reverse301',stamp+3000,false,'reverse301-second-reversal');
  perform public.test_assert(public.credit_balance(u)=80,'Second genuine reversal restores only its cycle');
  perform public.expire_subscription_credits(u,'sub_reverse301','reverse301-stripe-expiry','cancelled');
  perform public.test_assert(public.credit_balance(u)=70,'Website expiry cannot expire restored native credits');
  perform public.test_assert((select count(*)=1 from public.native_transactions where user_id=u),'No second purchase or monthly grant');
  perform public.test_assert((select count(*)=2 from public.credit_ledger where user_id=u and reason='native_refund_reversal'),'Two actual reversals, not duplicate events');
  perform public.test_assert((select count(*)=4 from private.native_refund_revisions r join public.native_transactions t on t.id=r.transaction_id where t.user_id=u),'Each financial state change audited');
  perform public.test_assert((public.get_native_purchase_event('reverse301-duplicate-reversal')->>'refundKnown')::boolean,'Reversal is a future recovery hint');
  result := public.get_native_customer_billing(u);
  perform public.test_assert(result->'recentTransactions'->0->>'reason'='native_refund_reversal','Website native transaction reader includes reversal');
  perform public.test_assert(result->'recentTransactions'->0->>'label'='Store refund reversed · credits restored','Readable non-invoice reversal description');
  result := public.get_mobile_billing_snapshot(u,'SANDBOX','APP_STORE');
  perform public.test_assert(exists(select 1 from jsonb_array_elements(result->'transactions') t where t->>'label'='Store refund reversed · credits restored' and t->>'provider'='app_store'),'Mobile attributes reversal to Apple');
  begin
    perform public.fixture_refund_revision(u,'reverse301',stamp+3000,true,'reverse301-conflicting-revision');
    raise exception 'Conflicting timestamp accepted';
  exception when check_violation then null; end;
  perform public.test_assert(not exists(select 1 from public.native_purchase_events where id='reverse301-conflicting-revision'),'Conflicting event and accounting roll back atomically');
end $$;

-- Entire grant reserved: reversal returns ZERO until the failed job returns it.
do $$
declare u uuid := '00000000-0000-4000-8000-000000000302'; stamp bigint := (extract(epoch from now())*1000)::bigint-10000;
begin
  insert into public.profiles(id) values(u);
  insert into public.jobs(id,user_id,type,status) values(u,u,'staging','processing');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','reverse302','rc-purchase:reverse302','pack20',to_timestamp((stamp-100000)::numeric/1000));
  insert into public.credit_ledger(user_id,delta,reason,idempotency_key,job_id) values(u,-20,'job_reserve','reverse302-reserve',u);
  perform public.fixture_refund_revision(u,'reverse302',stamp,true,'reverse302-refund');
  perform public.fixture_refund_revision(u,'reverse302',stamp+1000,false,'reverse302-reversal');
  perform public.test_assert(public.credit_balance(u)=0,'Reversal never grants spent or reserved credits again');
  perform public.test_assert(not exists(select 1 from public.credit_ledger where user_id=u and reason='native_refund_reversal'),'No invented zero-value grant');
  insert into public.credit_ledger(user_id,delta,reason,idempotency_key,job_id) values(u,20,'job_refund','reverse302-job-refund',u);
  perform public.test_assert(public.credit_balance(u)=20,'Failed job returns original unrecovered allocation after reversal');
end $$;

-- Reverse order of the previous case: late failed job returns are recovered while
-- revoked; reversal subsequently restores those credits once.
do $$
declare u uuid := '00000000-0000-4000-8000-000000000303'; stamp bigint := (extract(epoch from now())*1000)::bigint-10000;
begin
  insert into public.profiles(id) values(u);
  insert into public.jobs(id,user_id,type,status) values(u,u,'staging','processing');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','reverse303','rc-purchase:reverse303','pack20',to_timestamp((stamp-100000)::numeric/1000));
  insert into public.credit_ledger(user_id,delta,reason,idempotency_key,job_id) values(u,-20,'job_reserve','reverse303-reserve',u);
  perform public.fixture_refund_revision(u,'reverse303',stamp,true,'reverse303-refund');
  insert into public.credit_ledger(user_id,delta,reason,idempotency_key,job_id) values(u,20,'job_refund','reverse303-job-refund',u);
  perform public.test_assert(public.credit_balance(u)=0,'Failed job before reversal recovers revoked credits');
  perform public.fixture_refund_revision(u,'reverse303',stamp+1000,false,'reverse303-reversal');
  perform public.test_assert(public.credit_balance(u)=20,'Reversal restores recovered late job refund exactly once');
end $$;

do $$
declare u uuid := '00000000-0000-4000-8000-000000000304'; stamp bigint := (extract(epoch from now())*1000)::bigint-10000;
begin
  insert into public.profiles(id) values(u);
  perform public.fixture_refund_revision(u,'reverse304',stamp,false,'reverse304-first');
  perform public.fixture_refund_revision(u,'reverse304',stamp-1000,true,'reverse304-old-refund');
  perform public.test_assert(public.credit_balance(u)=20,'Reversal-before-original reconstructs one paid grant and rejects older refund');
  perform public.test_assert(not exists(select 1 from public.credit_ledger where user_id=u and reason='native_refund_reversal'),'Never restore credits that were not recovered');
end $$;
select public.test_assert(not has_function_privilege('authenticated','private.apply_native_refund_revision(uuid,boolean,bigint,text)','EXECUTE'),'Customers cannot submit refund evidence');
select public.test_assert(not has_function_privilege('service_role','private.apply_native_refund_revision(uuid,boolean,bigint,text)','EXECUTE'),'Private helper cannot bypass event/identity verification through RPC');
select public.test_assert(not has_function_privilege('service_role','private.apply_native_event_before_refund_revisions(text,jsonb)','EXECUTE'),'No exposed legacy processor bypass');

-- Historical monthly refund/reversal must not grant a second renewal or alter
-- the other month's non-expiring source. Current cancellation state is separate.
do $$
declare u uuid := '00000000-0000-4000-8000-000000000306'; stamp bigint := (extract(epoch from now())*1000)::bigint;
  purchased timestamptz := to_timestamp((stamp-60::bigint*86400000)::numeric/1000); e jsonb; v jsonb;
begin
  insert into public.profiles(id) values(u);
  insert into public.native_product_versions(environment,store,product_id,package_version_id,name,kind,credits,max_source_photos_per_project)
    select environment,'APP_STORE','monthly50',package_version_id,name,kind,credits,max_source_photos_per_project
    from public.native_product_versions where store='PLAY_STORE' and product_id='monthly50';
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','reverse306-old','rc-subscription:reverse306','monthly50',purchased,purchased+interval '30 days');
  perform public.record_verified_native_purchase(u,'SANDBOX','APP_STORE','reverse306-new','rc-subscription:reverse306','monthly50',purchased+interval '30 days',now()+interval '1 day');
  e := jsonb_build_object('id','reverse306-refund','type','CANCELLATION','cancel_reason','CUSTOMER_SUPPORT','app_id','app_apple',
    'app_user_id',u,'original_app_user_id',u,'environment','SANDBOX','store','APP_STORE','is_family_share',false,'period_type','NORMAL',
    'product_id','monthly50','transaction_id','reverse306-old','original_transaction_id','reverse306-old',
    'purchased_at_ms',stamp-60::bigint*86400000,'event_timestamp_ms',stamp);
  v := jsonb_build_object('purchase',jsonb_build_object('userId',u,'environment','SANDBOX','store','APP_STORE',
    'transactionId','reverse306-old','familyId','rc-subscription:reverse306','productId','monthly50',
    'purchasedAt',purchased,'periodEnd',purchased+interval '30 days'),'grant',true,'refund',true,
    'refundState',jsonb_build_object('refunded',true,'revisionMs',stamp,'evidenceId','rc-recovery:'||repeat('a',64)),
    'subscription',jsonb_build_object('productId','monthly50','status','active','periodEnd',now()+interval '1 day',
      'cancelAtPeriodEnd',true,'verifiedAt',to_timestamp(stamp::numeric/1000)));
  perform public.accept_verified_native_webhook(e,repeat('a',64));
  perform public.apply_verified_native_event('reverse306-refund',v);
  perform public.test_assert(public.credit_balance(u)=50,'Only historical month recovered');
  e := e||jsonb_build_object('id','reverse306-reversal','type','REFUND_REVERSED','event_timestamp_ms',stamp+1000);
  v := v||jsonb_build_object('refund',false,'refundState',jsonb_build_object('refunded',false,'revisionMs',stamp+1000,'evidenceId','rc-recovery:'||repeat('b',64)));
  v := jsonb_set(v,'{subscription,verifiedAt}',to_jsonb(to_timestamp((stamp+1000)::numeric/1000)));
  perform public.accept_verified_native_webhook(e,repeat('b',64));
  perform public.apply_verified_native_event('reverse306-reversal',v);
  perform public.test_assert(public.credit_balance(u)=100,'Historical reversal restores only original month');
  perform public.test_assert((select count(*)=2 from public.native_credit_lots where user_id=u),'No extra monthly grant');
  perform public.test_assert((select count(*)=1 from public.native_subscriptions where user_id=u),'No duplicate subscription');
  perform public.test_assert((select cancel_at_period_end from public.native_subscriptions where user_id=u),'Restoring credits does not re-enable auto renewal');
  perform public.test_assert(not exists(select 1 from public.subscriptions where user_id=u),'No Apple IDs in Stripe subscriptions');
end $$;
