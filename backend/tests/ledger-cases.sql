-- Every identity/product below is synthetic; all assertions run in an isolated
-- disposable PostgreSQL container, with the real old Stripe trigger installed.
insert into public.native_product_versions(environment,store,product_id,package_version_id)
values('SANDBOX','APP_STORE','pack20','20000000-0000-4000-8000-000000000001'),
 ('SANDBOX','PLAY_STORE','monthly50','20000000-0000-4000-8000-000000000002');
select public.test_assert((select credits=20 and kind='consumable' from public.native_product_versions where product_id='pack20'), 'Immutable server-derived credit mapping');
do $$ begin
  begin
    insert into public.native_product_versions(environment,store,product_id,package_version_id)
    values('SANDBOX','APP_STORE','bad-developer','20000000-0000-4000-8000-000000000003');
    raise exception 'Developer package was incorrectly accepted';
  exception when invalid_parameter_value then null; end;
  begin update public.native_product_versions set credits=999; raise exception 'Immutable product changed';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    perform public.record_verified_native_purchase('00000000-0000-4000-8000-000000000001','SANDBOX','APP_STORE','a','a','pack20',now());
    raise exception 'Disabled reconciliation granted credits';
  exception when object_not_in_prerequisite_state then null; end;
end $$;

update private.native_commerce_settings set environment='SANDBOX',reconciliation_enabled=true;
-- Pending API upload holds have no job ID yet. Their expiry must restore both
-- native and Stripe attribution and must tolerate an ON CONFLICT retry.
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000007','SANDBOX','APP_STORE','hold7','hold7','pack20',now());
insert into public.subscriptions(id,user_id,status) values('sub_fixture_7','00000000-0000-4000-8000-000000000007','active');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata) values
 ('00000000-0000-4000-8000-000000000007',5,'subscription_grant','sub7','{"subscription_id":"sub_fixture_7"}');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata) values
 ('00000000-0000-4000-8000-000000000007',-10,'job_reserve','hold7-reserve','{"api_hold_id":"hold-seven"}'),
 ('00000000-0000-4000-8000-000000000007',10,'job_refund','hold7-refund','{"api_hold_id":"hold-seven"}');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata) values
 ('00000000-0000-4000-8000-000000000007',10,'job_refund','hold7-refund','{"api_hold_id":"hold-seven"}') on conflict(idempotency_key) do nothing;
select public.test_assert(public.credit_balance('00000000-0000-4000-8000-000000000007')=25,'API hold refunded once');
select public.test_assert((select remaining=20 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000007'),'API hold native source restored');
select public.test_assert((select subscription_credit_balance=5 from public.subscriptions where id='sub_fixture_7'),'API hold Stripe source restored once');
do $$ begin
  begin
    perform public.record_verified_native_purchase('00000000-0000-4000-8000-000000000001','PRODUCTION','APP_STORE','a','a','pack20',now());
    raise exception 'Cross-environment grant was allowed';
  exception when object_not_in_prerequisite_state then null; end;
end $$;

-- Mixed sources: Stripe first, web top-up next, native FIFO last. Split job
-- refunds restore the original allocation, never invent a new web-funded grant.
insert into public.subscriptions(id,user_id,status) values('sub_fixture_1','00000000-0000-4000-8000-000000000001','active');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata) values
 ('00000000-0000-4000-8000-000000000001',10,'subscription_grant','sub1','{"subscription_id":"sub_fixture_1"}'),
 ('00000000-0000-4000-8000-000000000001',5,'purchase','web1','{}');
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000001','SANDBOX','APP_STORE','txn1','orig1','pack20',now());
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,job_id) values
 ('00000000-0000-4000-8000-000000000001',-22,'job_reserve','reserve1','30000000-0000-4000-8000-000000000001');
select public.test_assert((select subscription_credit_balance=0 from public.subscriptions where id='sub_fixture_1'),'Stripe spent first');
select public.test_assert((select remaining=13 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000001'),'Exactly 7 native credits used');
select public.test_assert((select metadata @> '{"subscription_credits_used":10,"web_credits_used":5,"native_credits_used":7}' from public.credit_ledger where idempotency_key='reserve1'),'Reserve source attribution');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,job_id) values
 ('00000000-0000-4000-8000-000000000001',4,'job_refund','refund1a','30000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000001',9,'job_refund','refund1b','30000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000001',9,'job_refund','refund1c','30000000-0000-4000-8000-000000000001');
select public.test_assert(public.credit_balance('00000000-0000-4000-8000-000000000001')=35,'Full job refund balance');
select public.test_assert((select remaining=20 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000001'),'Full native source restored');
select public.test_assert((select subscription_credit_balance=10 from public.subscriptions where id='sub_fixture_1'),'Full Stripe source restored');

-- Idempotency remains independent of callback/webhook/restore event identifiers.
select public.test_assert((public.record_verified_native_purchase('00000000-0000-4000-8000-000000000001','SANDBOX','APP_STORE','txn1','orig1','pack20',now())->>'duplicate')::boolean,'Duplicate purchase no second grant');
do $$ begin
  begin
    perform public.record_verified_native_purchase('00000000-0000-4000-8000-000000000002','SANDBOX','APP_STORE','txn1','orig1','pack20',now());
    raise exception 'Cross-account restore accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_verified_native_purchase('00000000-0000-4000-8000-000000000002','SANDBOX','APP_STORE','txn1-renewed','orig1','pack20',now());
    raise exception 'Cross-account purchase family accepted';
  exception when insufficient_privilege then null; end;
end $$;

-- Refund during imaging: no negative balance and no theft of web credits. A
-- later failed-image refund recovers ONLY the revoked native portion.
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000002','SANDBOX','APP_STORE','txn2','orig2','pack20',now());
insert into public.credit_ledger(user_id,delta,reason,idempotency_key) values
 ('00000000-0000-4000-8000-000000000002',50,'manual_adjust','admin2');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,job_id) values
 ('00000000-0000-4000-8000-000000000002',-65,'job_reserve','reserve2','30000000-0000-4000-8000-000000000002');
select public.test_assert((public.record_verified_native_refund('SANDBOX','APP_STORE','txn2')->>'shortfall')::integer=15,'Spent native refund shortfall is audited');
select public.test_assert(public.credit_balance('00000000-0000-4000-8000-000000000002')=0,'Refund cannot make balance negative');
select public.test_assert((public.record_verified_native_refund('SANDBOX','APP_STORE','txn2')->>'creditsRecovered')::integer=0,'Duplicate refund does not debit twice');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,job_id) values
 ('00000000-0000-4000-8000-000000000002',65,'job_refund','refund2','30000000-0000-4000-8000-000000000002');
select public.test_assert(public.credit_balance('00000000-0000-4000-8000-000000000002')=50,'Late job refund keeps web funds, reclaims revoked native funds');
select public.test_assert((select remaining=0 and recovered=20 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000002'),'Fully recovered native grant');
select public.test_assert((select shortfall=0 and resolved_at is not null from public.native_reconciliation_alerts where user_id='00000000-0000-4000-8000-000000000002'),'Late refund resolves shortfall audit');

-- Native monthly grants do not enter Stripe subscription_credit_balance and do
-- not expire with web rollover, web subscription cancellation or time passing.
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000003','SANDBOX','PLAY_STORE','txn3','orig3','monthly50',now()-interval '1 day',now()+interval '29 days');
insert into public.subscriptions(id,user_id,status) values('sub_fixture_3','00000000-0000-4000-8000-000000000003','active');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata) values
 ('00000000-0000-4000-8000-000000000003',10,'subscription_grant','sub3','{"subscription_id":"sub_fixture_3"}');
select public.apply_subscription_invoice_credit('00000000-0000-4000-8000-000000000003','sub_fixture_3','20000000-0000-4000-8000-000000000002',now(),'evt_fixture_3','invoice_fixture_3');
select public.test_assert(public.credit_balance('00000000-0000-4000-8000-000000000003')=100,'Stripe rollover expired only 10 Stripe credits and granted 50');
select public.expire_subscription_credits('00000000-0000-4000-8000-000000000003','sub_fixture_3','evt_expire_3','cancelled');
select public.test_assert(public.credit_balance('00000000-0000-4000-8000-000000000003')=50,'Stripe cancellation preserves native 50');
update public.native_subscriptions set status='expired' where user_id='00000000-0000-4000-8000-000000000003';
select public.test_assert((select remaining=50 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000003'),'Native expiry does not expire monthly grant');

-- Batch partial refunds preserve provenance too; purchase-off rollback must
-- continue processing already-paid transactions/reconciliation.
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000004','SANDBOX','APP_STORE','txn4','orig4','pack20',now());
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata) values
 ('00000000-0000-4000-8000-000000000004',-15,'batch_reserve','batch4','{"batch_id":"batch-four"}'),
 ('00000000-0000-4000-8000-000000000004',5,'batch_refund','batch4-refund1','{"batch_id":"batch-four"}'),
 ('00000000-0000-4000-8000-000000000004',10,'batch_refund','batch4-refund2','{"batch_id":"batch-four"}');
select public.test_assert((select remaining=20 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000004'),'Batch refunds restore native lot');
select public.test_assert((select not acquisition_enabled from private.native_commerce_settings),'Acquisition remains off during reconciliation');

-- Native recovery cannot silently consume a current Stripe bucket.
insert into public.subscriptions(id,user_id,status) values('sub_fixture_4','00000000-0000-4000-8000-000000000004','active');
insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata) values
 ('00000000-0000-4000-8000-000000000004',10,'subscription_grant','sub4','{"subscription_id":"sub_fixture_4"}');
select public.record_verified_native_refund('SANDBOX','APP_STORE','txn4');
select public.test_assert((select subscription_credit_balance=10 from public.subscriptions where id='sub_fixture_4'),'Native refund never steals Stripe attribution');
select public.test_assert(public.credit_balance('00000000-0000-4000-8000-000000000004')=10,'Stripe-funded balance protected');

-- Native grants cannot be executed by public customer roles or browsed directly.
select public.test_assert(not has_function_privilege('authenticated','public.record_verified_native_purchase(uuid,text,text,text,text,text,timestamptz,timestamptz,numeric,text)','EXECUTE'),'Authenticated cannot grant credits');
select public.test_assert(not has_function_privilege('anon','public.record_verified_native_refund(text,text,text)','EXECUTE'),'Anonymous cannot refund');
select public.test_assert(not has_table_privilege('authenticated','public.native_transactions','SELECT'),'Customer cannot enumerate purchase owners');
select public.test_assert((select bool_and(relrowsecurity) from pg_class where oid in('public.native_transactions'::regclass,'public.native_subscriptions'::regclass,'public.native_credit_lots'::regclass)),'RLS enabled');

-- Actual service-role ledger writes still execute the source-accounting trigger.
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000005','SANDBOX','APP_STORE','txn5','orig5','pack20',now());
set role service_role;
insert into public.credit_ledger(user_id,delta,reason,idempotency_key) values
 ('00000000-0000-4000-8000-000000000005',-5,'job_reserve','service-role-reserve');
reset role;
select public.test_assert((select remaining=15 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000005'),'Service-role trigger privileges');
do $$ begin
  begin
    insert into public.credit_ledger(user_id,delta,reason,idempotency_key) values
    ('00000000-0000-4000-8000-000000000005',-100,'job_reserve','overspend');
    raise exception 'Overspend accepted' using errcode='23514';
  exception when raise_exception then null; end;
end $$;
select public.test_assert((select remaining=15 from public.native_credit_lots where user_id='00000000-0000-4000-8000-000000000005'),'Insufficient-credit failure is atomic');

-- Two grants in the same database transaction still follow insertion/grant order,
-- not randomly ordered UUIDs. A rolled-back failed debit leaves both lots intact.
begin;
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000006','SANDBOX','APP_STORE','fifo1','fifo1','pack20',now());
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000006','SANDBOX','APP_STORE','fifo2','fifo2','pack20',now());
commit;
insert into public.credit_ledger(user_id,delta,reason,idempotency_key) values
 ('00000000-0000-4000-8000-000000000006',-25,'job_reserve','fifo-spend');
select public.test_assert((select remaining=0 from public.native_credit_lots l join public.native_transactions t on t.id=l.transaction_id where t.store_transaction_id='fifo1'),'First native grant consumed first');
select public.test_assert((select remaining=15 from public.native_credit_lots l join public.native_transactions t on t.id=l.transaction_id where t.store_transaction_id='fifo2'),'Second native grant partially retained');
do $$ begin
  begin update private.native_commerce_settings set environment='PRODUCTION'; raise exception 'Mixed environments allowed';
  exception when object_not_in_prerequisite_state then null; end;
end $$;
