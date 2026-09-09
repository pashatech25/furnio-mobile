-- Disposable synthetic accounts only; everything in this file rolls back.
begin;
do $$
declare u uuid:='00000000-0000-4000-8000-000000000221'; other_u uuid:='00000000-0000-4000-8000-000000000222';
  session uuid:='10000000-0000-4000-8000-000000000221'; other_s uuid:='10000000-0000-4000-8000-000000000222';
  req uuid:='30000000-0000-4000-8000-000000000221'; other_req uuid:='30000000-0000-4000-8000-000000000222';
  project uuid:='40000000-0000-4000-8000-000000000221'; other_p uuid:='40000000-0000-4000-8000-000000000222';
  job uuid:='50000000-0000-4000-8000-000000000221'; completed uuid:='50000000-0000-4000-8000-000000000223';
  t timestamptz:=date_trunc('second',now()); r jsonb; claimed jsonb; old_lease uuid; one_scope uuid;
  total_before int; definition text;
begin
  insert into auth.users(id) values(u),(other_u);
  insert into public.profiles(id,email) values(u,'cleanup-fixture@example.invalid'),(other_u,'untouched@example.invalid');
  insert into auth.sessions(id,user_id) values(session,u),(other_s,other_u);
  insert into auth.mfa_amr_claims(session_id,authentication_method,updated_at) values(session,'password',t),(other_s,'password',t);
  insert into public.projects(id,user_id,name) values(project,u,'Fixture cleanup'),(other_p,other_u,'Keep this project');
  insert into public.assets(id,user_id) values(project,u),(other_p,other_u);
  insert into public.room_groups(id,user_id,project_id,name) values(project,u,project,'Room');
  insert into public.jobs(id,user_id,project_id,type,status,finished_at) values
    (job,u,project,'staging','running',null),(completed,u,project,'staging','succeeded',now()),
    (other_p,other_u,other_p,'staging','running',null);
  insert into public.job_steps(id,job_id,status) values(job,job,'running');
  insert into public.api_consumers(id,user_id) values(project,u),(other_p,other_u);
  insert into public.api_keys(id,consumer_id) values(project,project),(other_p,other_p);
  insert into public.api_sandbox_keys(id,consumer_id) values(project,project);
  insert into public.api_webhook_endpoints(id,consumer_id) values(project,project),(other_p,other_p);
  insert into public.api_job_links(job_id,consumer_id) values(job,project),(other_p,other_p);
  insert into public.api_webhook_deliveries(id,consumer_id,endpoint_id,event_id,event_type,payload)
    values(project,project,project,project,'job.started','{}');
  insert into private.mobile_push_devices(id,environment,eas_project_id,installation_id,secret_hash,revision,
    user_id,platform,push_token,enabled,enabled_at,lease_until) values
    (project,'staging',req,project,repeat('a',64),1,u,'ios','ExpoPushToken[cleanup_test_fixture]',true,now(),now()+interval '1 day');
  insert into private.mobile_push_deliveries(id,device_id,user_id,job_id,binding_version,expires_at)
    values(project,project,u,job,0,now()+interval '1 day');
  select count(*) into total_before from public.credit_ledger;
  update private.mobile_account_settings set environment='SANDBOX',review_enabled=true,requests_enabled=true,processor_ready=true;
  r:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',req,repeat('f',64),u,session,t,'password','aal1');
  begin
    perform private.begin_mobile_account_cleanup(req,'SANDBOX');
    raise exception 'Unconfirmed request fenced an account';
  exception when insufficient_privilege then null;end;
  perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',req,repeat('f',64),u,session,t,'password','aal1',
    (r->>'challenge')::uuid,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
  begin
    perform public.claim_mobile_account_media_cleanup('SANDBOX');
    raise exception 'Disabled cleanup ran';
  exception when sqlstate '55000' then null;end;
  perform public.test_assert(not exists(select 1 from private.mobile_account_cleanup where user_id=u),'No change while disabled');
  update private.mobile_account_settings set cleanup_enabled=true;
  begin
    perform public.claim_mobile_account_media_cleanup('PRODUCTION');
    raise exception 'Wrong environment fenced an account';
  exception when sqlstate '55000' then null;end;
  claimed:=public.claim_mobile_account_media_cleanup('SANDBOX');
  perform public.test_assert(claimed->>'userId'=u::text and claimed->>'requestId'=req::text,'Only confirmed account is scoped');
  one_scope:=(claimed->>'scopeId')::uuid; old_lease:=(claimed->>'leaseId')::uuid;
  perform public.test_assert((select lease_until=(claimed->>'leaseExpiresAt')::timestamptz from private.mobile_account_media_scopes where id=one_scope),'Returned lease deadline matches stored deadline exactly');
  perform public.test_assert((select count(*)=5 from private.mobile_account_media_scopes where request_id=req),'User input/output/masks plus both owned job prefixes');
  perform public.test_assert(not exists(select 1 from private.mobile_account_media_scopes where prefix='tmp/'||other_p||'/'),'Other customer temporary files excluded');
  perform public.test_assert((select account_status='suspended' from public.profiles where id=u),'Shared customer access suspended');
  perform public.test_assert((select archived_at is not null from public.projects where id=project),'Project archived before fence');
  perform public.test_assert((select status='cancelled' and finished_at is not null from public.jobs where id=job),'Running work marked terminal');
  perform public.test_assert((select status='cancelled' from public.job_steps where id=job),'Late provider callback sees terminal step');
  perform public.test_assert((select status='succeeded' from public.jobs where id=completed),'Completed history not falsely cancelled');
  perform public.test_assert((select status='closed' and not production_access_enabled and not approved_production_access_enabled from public.api_consumers where user_id=u),'Developer access closed, including approved ceilings');
  perform public.test_assert((select revoked_at is not null from public.api_keys where id=project),'Live key revoked');
  perform public.test_assert((select revoked_at is not null from public.api_sandbox_keys where id=project),'Sandbox key revoked');
  perform public.test_assert((select count(*)=1 from public.api_webhook_deliveries where consumer_id=project)
    and (select status='failed' from public.api_webhook_deliveries where id=project),'Cancellation does not enqueue a new webhook; pending owned deliveries stopped');
  perform public.test_assert((select not enabled and disabled_at is not null from public.api_webhook_endpoints where id=project),'Webhook destination disabled');
  perform public.test_assert((select enabled and disabled_at is null from public.api_webhook_endpoints where id=other_p),'Other customer destination unchanged');
  perform public.test_assert((select not enabled and push_token is null and user_id is null and binding_version=1 from private.mobile_push_devices where id=project),'Push installation detached and stale lease invalidated');
  perform public.test_assert((select state='cancelled' from private.mobile_push_deliveries where id=project),'Pending push cancelled');
  perform public.test_assert((select status='running' from public.jobs where id=other_p) and (select archived_at is null from public.projects where id=other_p),'Other customer work unchanged');
  perform public.test_assert((select revoked_at is null from public.api_keys where id=other_p),'Other customer credentials unchanged');
  perform public.test_assert((select count(*)=total_before from public.credit_ledger),'Fence does not forge credits or alter financial records');
  -- No settings switch or delayed package sync can reactivate the tombstoned account.
  update private.mobile_account_settings set cleanup_enabled=false;
  begin update public.profiles set account_status='active' where id=u;
    raise exception 'Deleting account reactivated'; exception when insufficient_privilege then null;end;
  begin update public.profiles set id=req,account_status='active' where id=u;
    raise exception 'Deleting account identity reassigned'; exception when insufficient_privilege then null;end;
  update public.api_consumers set status='active',api_access_enabled=true,production_access_enabled=true,
    approved_production_access_enabled=true where user_id=u;
  perform public.test_assert((select status='closed' and not api_access_enabled and not production_access_enabled and not approved_production_access_enabled from public.api_consumers where user_id=u),'Renewal/package sync stays closed');
  update public.api_webhook_endpoints set enabled=true,disabled_at=null where id=project;
  perform public.test_assert((select not enabled and disabled_at is not null from public.api_webhook_endpoints where id=project),'Delayed webhook configuration cannot reactivate destination');
  begin update public.api_consumers set user_id='00000000-0000-4000-8000-000000000001' where user_id=u;
    raise exception 'Deleting consumer reassigned'; exception when insufficient_privilege then null;end;
  begin insert into public.projects(id,user_id,name) values(req,u,'late project');
    raise exception 'Late project admitted'; exception when insufficient_privilege then null;end;
  begin insert into public.assets(id,user_id) values(req,u);
    raise exception 'Late provider image admitted'; exception when insufficient_privilege then null;end;
  begin update public.assets set user_id=other_u where id=project;
    raise exception 'Fenced media reassigned'; exception when insufficient_privilege then null;end;
  begin update public.assets set user_id=u where id=other_p;
    raise exception 'New media assigned to deleting account'; exception when insufficient_privilege then null;end;
  begin update public.jobs set status='succeeded' where id=job;
    raise exception 'Late work completed after fence'; exception when insufficient_privilege then null;end;
  begin update public.room_groups set name='late' where id=project;
    raise exception 'Late room update admitted'; exception when insufficient_privilege then null;end;
  -- Stale unexpired customer JWT cannot read the customer's formerly owned work.
  perform set_config('request.jwt.claim.sub',u::text,true);
  set local role authenticated;
  perform public.test_assert((select count(*)=0 from public.projects) and (select count(*)=0 from public.assets)
    and (select count(*)=0 from public.jobs) and (select count(*)=0 from public.room_groups)
    and (select count(*)=0 from public.profiles),'Fenced JWT loses direct customer-work RLS access');
  reset role;
  perform set_config('request.jwt.claim.sub',other_u::text,true);
  set local role authenticated;
  perform public.test_assert((select count(*)=1 from public.projects) and (select count(*)=1 from public.profiles),'Normal ownership access retained');
  reset role;
  -- Acknowledgement of already leased work is allowed during a flag rollback.
  begin perform public.finish_mobile_account_media_cleanup('PRODUCTION',one_scope,old_lease,'empty');
    raise exception 'Wrong environment acknowledged'; exception when insufficient_privilege then null;end;
  begin perform public.finish_mobile_account_media_cleanup('SANDBOX',one_scope,req,'empty');
    raise exception 'Wrong lease acknowledged'; exception when insufficient_privilege then null;end;
  perform public.finish_mobile_account_media_cleanup('SANDBOX',one_scope,old_lease,'empty');
  perform public.test_assert((select verified_empty_at is null and first_empty_at is not null from private.mobile_account_media_scopes where id=one_scope),'First empty page never completes cleanup');
  begin perform public.finish_mobile_account_media_cleanup('SANDBOX',one_scope,old_lease,'deleted_page');
    raise exception 'Old acknowledgement reused'; exception when insufficient_privilege then null;end;
  update private.mobile_account_settings set cleanup_enabled=true;
  -- Force a single due scope and model an expired claim, then a retry.
  update private.mobile_account_media_scopes set next_attempt_at=now()+interval '1 day' where request_id=req;
  update private.mobile_account_media_scopes set next_attempt_at=now()-interval '1 second',lease_id=old_lease,lease_until=now()-interval '1 second' where id=one_scope;
  claimed:=public.claim_mobile_account_media_cleanup('SANDBOX');
  perform public.test_assert((claimed->>'leaseId')::uuid<>old_lease and (claimed->>'scopeId')::uuid=one_scope,'Expired claim is retriable under a fresh lease');
  perform public.finish_mobile_account_media_cleanup('SANDBOX',one_scope,(claimed->>'leaseId')::uuid,'deleted_page');
  perform public.test_assert((select first_empty_at is null and verified_empty_at is null and pages_deleted=1 from private.mobile_account_media_scopes where id=one_scope),'Late file invalidates previous empty observation');
  claimed:=public.claim_mobile_account_media_cleanup('SANDBOX');
  perform public.finish_mobile_account_media_cleanup('SANDBOX',one_scope,(claimed->>'leaseId')::uuid,'storage_unavailable');
  perform public.test_assert((select last_error='storage_unavailable' and next_attempt_at>now()+interval '4 minutes' from private.mobile_account_media_scopes where id=one_scope),'Storage failure backs off without exposing its message');
  -- Retention can remove an old job mid-inventory without losing its tmp prefix.
  delete from private.mobile_account_media_scopes where job_id=completed;
  delete from public.jobs where id=completed;
  perform public.test_assert(exists(select 1 from private.mobile_account_media_scopes where job_id=completed and prefix='tmp/'||completed||'/'),'Job delete preserves cleanup ownership evidence');
  select id into one_scope from private.mobile_account_media_scopes where request_id=req and kind='input';
  -- Two separated empty observations after the URL quiet period advance only to
  -- external cleanup, not full account deletion. Hourly late-write sweeps continue.
  update private.mobile_account_cleanup set fenced_at=now()-interval '3 hours' where request_id=req;
  update private.mobile_account_media_scopes set lease_id=null,lease_until=null,next_attempt_at=now()-interval '1 second',first_empty_at=now()-interval '2 hours' where request_id=req;
  for counter in 1..5 loop
    claimed:=public.claim_mobile_account_media_cleanup('SANDBOX');
    perform public.finish_mobile_account_media_cleanup('SANDBOX',(claimed->>'scopeId')::uuid,(claimed->>'leaseId')::uuid,'empty');
  end loop;
  perform public.test_assert((select stage='external_cleanup_required' from private.mobile_account_cleanup where request_id=req),'Media stage does not falsely claim identity/provider cleanup');
  perform public.test_assert((select state='queued' from private.mobile_account_deletion_requests where id=req),'Customer receipt is not falsely completed');
  update private.mobile_account_media_scopes set next_attempt_at=now()-interval '1 second' where id=one_scope;
  claimed:=public.claim_mobile_account_media_cleanup('SANDBOX');
  perform public.test_assert(claimed is not null,'Late media sweep remains scheduled after quiet checks');
  perform public.finish_mobile_account_media_cleanup('SANDBOX',one_scope,(claimed->>'leaseId')::uuid,'empty');
  -- An administrator is held for ownership review, not silently erased.
  insert into public.admin_users(user_id,role,is_active) values(other_u,'owner',true);
  r:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',other_req,repeat('e',64),other_u,other_s,t,'password','aal1');
  perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',other_req,repeat('e',64),other_u,other_s,t,'password','aal1',
    (r->>'challenge')::uuid,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
  perform public.claim_mobile_account_media_cleanup('SANDBOX');
  perform public.test_assert((select stage='ownership_review' and fenced_at is null from private.mobile_account_cleanup where user_id=other_u),'Administrator ownership requires explicit transfer');
  perform public.test_assert((select account_status='active' from public.profiles where id=other_u),'Ownership review does not unexpectedly disable operating administrator');
  perform public.test_assert(not has_function_privilege('authenticated','public.claim_mobile_account_media_cleanup(text)','execute')
    and not has_function_privilege('anon','public.finish_mobile_account_media_cleanup(text,uuid,uuid,text)','execute'),'No public destructive RPC');
  perform public.test_assert(has_function_privilege('service_role','public.claim_mobile_account_media_cleanup(text)','execute'),'Server has scoped claim RPC');
  perform public.test_assert(not has_table_privilege('service_role','private.mobile_account_cleanup','insert')
    and not has_table_privilege('service_role','private.mobile_account_media_scopes','update'),'Service cannot forge deletion fence or media scopes');
end $$;
rollback;
