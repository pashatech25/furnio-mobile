begin;
do $$
declare u uuid:='00000000-0000-4000-8000-000000000211'; other_u uuid:='00000000-0000-4000-8000-000000000212';
  s uuid:='10000000-0000-4000-8000-000000000211'; other_s uuid:='10000000-0000-4000-8000-000000000212';
  req uuid:='30000000-0000-4000-8000-000000000211'; second_req uuid:='30000000-0000-4000-8000-000000000212';
  t timestamptz:=date_trunc('second',now())-interval '20 seconds'; r jsonb; again jsonb; nonce uuid;
  sig text:='public.manage_mobile_account_deletion_request(text,text,uuid,text,uuid,uuid,timestamptz,text,text,uuid,text,text,boolean,boolean)';
begin
  insert into auth.users(id) values(u),(other_u);
  insert into public.profiles(id,email) values(u,'delete-request@example.invalid'),(other_u,'different@example.invalid');
  insert into auth.sessions(id,user_id) values(s,u),(other_s,other_u);
  insert into auth.mfa_amr_claims(session_id,authentication_method,updated_at) values(s,'password',t),(other_s,'password',t);
  update private.mobile_account_settings set environment='SANDBOX',review_enabled=true;
  begin
    perform public.manage_mobile_account_deletion_request('prepare','SANDBOX',req,repeat('a',64),u,s,t,'password','aal1');
    raise exception 'Disabled preparation accepted';
  exception when sqlstate '55000' then null;end;
  update private.mobile_account_settings set requests_enabled=true;
  r:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',req,repeat('a',64),u,s,t,'password','aal1');
  nonce:=(r->>'challenge')::uuid;
  perform public.test_assert(r->>'state'='prepared' and r->>'canConfirm'='false' and nonce is not null,'Review only until processor readiness');
  perform public.test_assert((r->>'expiresAt')::timestamptz=t+interval '5 minutes','Challenge cannot outlive fresh authentication');
  again:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',req,repeat('a',64),u,s,t,'password','aal1');
  perform public.test_assert(again=r and (select count(*)=1 from private.mobile_account_deletion_requests where user_id=u),'Lost response retry is idempotent and does not extend window');
  begin
    perform public.manage_mobile_account_deletion_request('prepare','SANDBOX',second_req,repeat('b',64),u,s,t,'password','aal1');
    raise exception 'Second open request accepted';
  exception when unique_violation then null;end;
  begin
    perform public.manage_mobile_account_deletion_request('prepare','SANDBOX',req,repeat('a',64),other_u,other_s,t,'password','aal1');
    raise exception 'Cross-account preparation accepted';
  exception when insufficient_privilege then null;end;
  begin
    perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',req,repeat('a',64),u,s,t,'password','aal1',nonce,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
    raise exception 'Missing cleanup processor accepted';
  exception when sqlstate '55000' then null;end;
  update private.mobile_account_settings set processor_ready=true;
  begin
    perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',req,repeat('a',64),u,s,t,'password','aal1',nonce,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,false);
    raise exception 'Missing billing acknowledgement accepted';
  exception when insufficient_privilege then null;end;
  begin
    perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',req,repeat('a',64),u,s,t,'password','aal1',second_req,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
    raise exception 'Wrong nonce accepted';
  exception when insufficient_privilege then null;end;
  begin
    perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',req,repeat('a',64),u,s,t,'password','aal1',nonce,'old-notice','DELETE MY FURNIO ACCOUNT',true,true);
    raise exception 'Old notice version accepted';
  exception when insufficient_privilege then null;end;
  insert into public.projects(id,user_id,name) values(s,u,'Changed since review');
  begin
    perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',req,repeat('a',64),u,s,t,'password','aal1',nonce,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
    raise exception 'Changed account review accepted';
  exception when check_violation then null;end;
  again:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',req,repeat('a',64),u,s,t,'password','aal1');
  perform public.test_assert(again->>'canConfirm'='false','Stale review cannot be silently replaced on retry');
  again:=public.manage_mobile_account_deletion_request('cancel','SANDBOX',req,repeat('a',64),u,s,t,'password','aal1');
  perform public.test_assert(again->>'state'='cancelled','Unconfirmed review can be cancelled');
  r:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',second_req,repeat('b',64),u,s,t,'password','aal1');
  nonce:=(r->>'challenge')::uuid;
  again:=public.manage_mobile_account_deletion_request('confirm','SANDBOX',second_req,repeat('b',64),u,s,t,'password','aal1',nonce,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
  perform public.test_assert(again->>'state'='queued' and again->>'confirmedAt' is not null,'Explicit acceptance is durable, not deletion completion');
  r:=public.manage_mobile_account_deletion_request('confirm','SANDBOX',second_req,repeat('b',64),u,s,t,'password','aal1',nonce,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
  perform public.test_assert(r=again,'Duplicate confirmation returns original receipt');
  r:=public.manage_mobile_account_deletion_request('cancel','SANDBOX',second_req,repeat('b',64),u,s,t,'password','aal1');
  perform public.test_assert(r=again,'Delayed cancellation does not undo confirmed deletion');
  perform public.test_assert((select email='delete-request@example.invalid' and account_status='active' from public.profiles where id=u),'Journal does not secretly mutate login/profile');
  perform public.test_assert((select count(*)=1 from public.projects where user_id=u),'No customer work deleted by confirmation journal');
  update private.mobile_account_settings set review_enabled=false,requests_enabled=false,processor_ready=false;
  delete from auth.sessions where id=s;
  update auth.users set deleted_at=now() where id=u;
  r:=public.manage_mobile_account_deletion_request('status','SANDBOX',second_req,repeat('b',64));
  perform public.test_assert(r=again,'Receipt survives flag rollback, sign-out and Auth deletion');
  perform public.test_assert(not (r?'challenge') and not(r?'userId') and not(r?'review') and not(r?'receiptSecret'),'Receipt cannot disclose account or confirmation details');
  perform public.test_assert(public.manage_mobile_account_deletion_request('status','SANDBOX',second_req,repeat('c',64)) is null,'Wrong receipt returns no data');
  perform public.test_assert(public.manage_mobile_account_deletion_request('status','SANDBOX',s,repeat('b',64)) is null,'Missing request is indistinguishable from wrong secret');
  begin
    perform public.manage_mobile_account_deletion_request('status','PRODUCTION',second_req,repeat('b',64));
    raise exception 'Cross-environment status returned';
  exception when sqlstate '55000' then null;end;
  begin
    perform public.manage_mobile_account_deletion_request('status','SANDBOX',second_req,repeat('b',64),u);
    raise exception 'Status accepted identity selectors';
  exception when invalid_parameter_value then null;end;
  perform public.test_assert(not has_function_privilege('anon',sig,'execute') and not has_function_privilege('authenticated',sig,'execute'),'No browser/customer RPC authority');
  perform public.test_assert(has_function_privilege('service_role',sig,'execute'),'Server has scoped action RPC');
  perform public.test_assert(not has_table_privilege('service_role','private.mobile_account_deletion_requests','update'),'Server cannot forge confirmed journal rows');
  perform public.test_assert(not has_table_privilege('service_role','private.mobile_account_settings','update'),'Server cannot enable destructive acceptance');
  update private.mobile_account_settings set review_enabled=true,requests_enabled=true,processor_ready=true;
  r:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',other_s,repeat('e',64),other_u,other_s,t,'password','aal1');
  update private.mobile_account_deletion_requests set created_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute'
    where id=other_s;
  again:=public.manage_mobile_account_deletion_request('status','SANDBOX',other_s,repeat('e',64));
  perform public.test_assert(again->>'state'='expired','Receipt reflects expired confirmation without a cleanup job');
  begin
    perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',other_s,repeat('e',64),other_u,other_s,t,'password','aal1',(r->>'challenge')::uuid,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
    raise exception 'Expired confirmation accepted';
  exception when check_violation then null;end;
  again:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',other_s,repeat('e',64),other_u,other_s,t,'password','aal1');
  perform public.test_assert(again->>'state'='expired' and again->>'challenge' is null and again->>'canConfirm'='false','Expired request cannot be resurrected');
end $$;
rollback;
