-- Synthetic database-only evidence. This does not exercise Supabase Auth HTTP.
-- Updating banned_until below simulates the supported API's committed result.
begin;
do $$
declare u uuid:='00000000-0000-4000-8000-000000000231'; other_u uuid:='00000000-0000-4000-8000-000000000232';
  admin_u uuid:='00000000-0000-4000-8000-000000000233'; session uuid:='10000000-0000-4000-8000-000000000231';
  req uuid:='30000000-0000-4000-8000-000000000231'; admin_req uuid:='30000000-0000-4000-8000-000000000233';
  t timestamptz:=date_trunc('second',now()); r jsonb; claimed jsonb; token uuid; deadline timestamptz;
begin
  insert into auth.users(id) values(u),(other_u),(admin_u);
  insert into public.profiles(id,email) values(u,'auth-block-fixture@example.invalid'),(other_u,'untouched@example.invalid'),(admin_u,'admin-fixture@example.invalid');
  insert into auth.sessions(id,user_id) values(session,u);
  insert into auth.mfa_amr_claims(session_id,authentication_method,updated_at) values(session,'password',t);
  insert into public.credit_ledger(user_id,delta,reason,idempotency_key) values(u,50,'manual_adjust','auth-block-fixture-grant');
  update private.mobile_account_settings set environment='SANDBOX',review_enabled=true,requests_enabled=true,processor_ready=true,cleanup_enabled=true;
  r:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',req,repeat('a',64),u,session,t,'password','aal1');
  perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',req,repeat('a',64),u,session,t,'password','aal1',
    (r->>'challenge')::uuid,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
  begin perform public.claim_mobile_account_auth_block('SANDBOX'); raise exception 'Disabled Auth block claimed work';
    exception when sqlstate '55000' then null; end;
  update private.mobile_account_settings set auth_block_enabled=true;
  perform public.test_assert(public.claim_mobile_account_auth_block('SANDBOX') is null,'Unfenced request cannot ban an identity');
  perform private.begin_mobile_account_cleanup(req,'SANDBOX');
  begin perform public.claim_mobile_account_auth_block('PRODUCTION'); raise exception 'Wrong environment accepted';
    exception when sqlstate '55000' then null; end;
  claimed:=public.claim_mobile_account_auth_block('SANDBOX');
  token:=(claimed->>'leaseId')::uuid; deadline:=(claimed->>'leaseExpiresAt')::timestamptz;
  perform public.test_assert(claimed->>'userId'=u::text and claimed->>'requestId'=req::text and claimed->>'action'='block_sign_in','Lease has exact fenced owner and operation');
  perform public.test_assert((select count(*)=5 from jsonb_object_keys(claimed)),'Lease contains no email, token, receipt secret or photo');
  perform public.test_assert((select auth_block_lease_until=deadline from private.mobile_account_cleanup where request_id=req),'Lease timestamp matches storage');
  perform public.test_assert(public.claim_mobile_account_auth_block('SANDBOX') is null,'Already leased account cannot be claimed twice');
  perform public.test_assert((select banned_until is null from auth.users where id=u),'Claim never modifies Auth');
  perform public.test_assert(not public.finish_mobile_account_auth_block('SANDBOX',req,gen_random_uuid(),'blocked'),'Foreign lease cannot acknowledge');
  perform public.test_assert(not public.finish_mobile_account_auth_block('PRODUCTION',req,token,'blocked'),'Cross-environment acknowledgement rejected');
  perform public.test_assert(not public.finish_mobile_account_auth_block('SANDBOX',req,token,'blocked'),'Unverified API success cannot fabricate a ban');
  perform public.test_assert((select auth_block_error='ban_not_verified' and auth_block_verified_until is null and auth_block_next_attempt_at>now()+interval '4 minutes'
    from private.mobile_account_cleanup where request_id=req),'Unverified checkpoint gets bounded retry and safe error');
  update private.mobile_account_cleanup set auth_block_next_attempt_at=now() where request_id=req;
  claimed:=public.claim_mobile_account_auth_block('SANDBOX'); token:=(claimed->>'leaseId')::uuid;
  update auth.users set banned_until=now()+interval '10 days' where id=u;
  perform public.test_assert(not public.finish_mobile_account_auth_block('SANDBOX',req,token,'blocked'),'Short ban is not accepted');
  update private.mobile_account_cleanup set auth_block_next_attempt_at=now() where request_id=req;
  claimed:=public.claim_mobile_account_auth_block('SANDBOX'); token:=(claimed->>'leaseId')::uuid;
  update auth.users set banned_until=now()+interval '100 years' where id=u;
  -- Emergency rollback stops NEW work but cannot discard a completed checkpoint.
  update private.mobile_account_settings set cleanup_enabled=false,auth_block_enabled=false;
  perform public.test_assert(public.finish_mobile_account_auth_block('SANDBOX',req,token,'blocked'),'Existing lease can acknowledge during rollback');
  perform public.test_assert((select auth_block_verified_until=(select banned_until from auth.users where id=u)
    and auth_block_checked_at is not null and auth_block_error is null and auth_block_next_attempt_at>now()+interval '23 hours'
    and auth_block_lease_id is null from private.mobile_account_cleanup where request_id=req),'Verified ban recorded and next read deferred');
  perform public.test_assert(not public.finish_mobile_account_auth_block('SANDBOX',req,token,'blocked'),'Replayed checkpoint cannot extend observation');
  perform public.test_assert((select state='queued' from private.mobile_account_deletion_requests where id=req),'Sign-in ban is NOT completed deletion');
  perform public.test_assert((select count(*)=1 from auth.sessions where user_id=u),'Sign-in ban is NOT session revocation');
  perform public.test_assert(public.credit_balance(u)=50,'Existing financial history preserved');
  perform public.test_assert((select banned_until is null and deleted_at is null from auth.users where id=other_u),'Unrelated Auth identity unchanged');
  -- A promotion cannot race the external operation after the permanent fence.
  begin insert into public.admin_users(user_id,role) values(u,'admin'); raise exception 'Fenced identity received administrator access';
    exception when insufficient_privilege then null; end;
  insert into public.admin_users(user_id,role,is_active) values(u,'admin',false);
  begin update public.admin_users set is_active=true where user_id=u; raise exception 'Fenced administrator reactivated';
    exception when insufficient_privilege then null; end;
  insert into public.admin_users(user_id,role) values(admin_u,'admin');
  perform public.test_assert((select is_active from public.admin_users where user_id=admin_u),'Unrelated administrator operation unchanged');
  update private.mobile_account_settings set cleanup_enabled=true,auth_block_enabled=true;
  update private.mobile_account_cleanup set auth_block_next_attempt_at=now() where request_id=req;
  claimed:=public.claim_mobile_account_auth_block('SANDBOX'); token:=(claimed->>'leaseId')::uuid;
  update private.mobile_account_cleanup set auth_block_lease_until=now()-interval '1 second' where request_id=req;
  perform public.test_assert(not public.finish_mobile_account_auth_block('SANDBOX',req,token,'blocked'),'Expired lease cannot acknowledge');
  claimed:=public.claim_mobile_account_auth_block('SANDBOX');
  perform public.test_assert((claimed->>'leaseId')::uuid<>token,'Expired lease is reclaimable');
  perform public.test_assert(not public.finish_mobile_account_auth_block('SANDBOX',req,token,'blocked'),'Old lease remains invalid after reclaim');
  token:=(claimed->>'leaseId')::uuid;
  perform public.test_assert(not public.finish_mobile_account_auth_block('SANDBOX',req,token,'auth_unavailable'),'Outage never creates success');
  perform public.test_assert((select auth_block_error='auth_unavailable' from private.mobile_account_cleanup where request_id=req),'Safe outage marker retained');
  perform public.test_assert(not has_function_privilege('anon','public.claim_mobile_account_auth_block(text)','EXECUTE')
    and not has_function_privilege('authenticated','public.finish_mobile_account_auth_block(text,uuid,uuid,text)','EXECUTE'),'No public claim/ack privilege');
  perform public.test_assert(has_function_privilege('service_role','public.claim_mobile_account_auth_block(text)','EXECUTE')
    and not has_table_privilege('service_role','private.mobile_account_cleanup','UPDATE'),'Worker uses narrow RPC, not direct table writes');
end;$$;
rollback;
