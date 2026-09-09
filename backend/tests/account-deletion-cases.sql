begin;
do $$
declare customer uuid:='00000000-0000-4000-8000-000000000201';other_customer uuid:='00000000-0000-4000-8000-000000000202';
  session uuid:='10000000-0000-4000-8000-000000000201';other_session uuid:='10000000-0000-4000-8000-000000000202';
  auth_time timestamptz:=date_trunc('second',now())-interval '15 seconds';result jsonb;method text;age timestamptz;product uuid;
begin
  insert into auth.users(id) values(customer),(other_customer);
  insert into public.profiles(id,email) values(customer,'deletion-fixture@example.invalid'),(other_customer,'other-fixture@example.invalid');
  insert into auth.sessions(id,user_id) values(session,customer),(other_session,other_customer);
  insert into auth.mfa_amr_claims(session_id,authentication_method,updated_at) values(session,'password',auth_time),(other_session,'password',auth_time);
  insert into auth.identities(user_id,provider) values(customer,'email'),(customer,'apple'),(other_customer,'google');
  insert into public.projects(id,user_id,name) values(session,customer,'Private property'),(other_session,other_customer,'Not yours');
  insert into public.assets(id,user_id) values(session,customer),(other_session,other_customer);
  insert into public.assets(id,user_id,purged_at) values('10000000-0000-4000-8000-000000000203',customer,now());
  insert into public.jobs(id,user_id,project_id,type,status) values(session,customer,session,'stage_single','queued'),(other_session,other_customer,other_session,'stage_single','running');
  insert into public.subscriptions(id,user_id,status,billing_context,cancel_at_period_end) values
    ('sub_account_review_customer',customer,'active','customer',false),
    ('sub_account_review_developer',customer,'past_due','developer',true),
    ('sub_account_review_other',other_customer,'active','customer',false);
  insert into public.native_product_versions(environment,store,product_id,package_version_id,name,kind,credits,max_source_photos_per_project)
    values('SANDBOX','APP_STORE','deletion_review_monthly','20000000-0000-4000-8000-000000000002','immutable','subscription',50,20) returning id into product;
  insert into public.native_subscriptions(user_id,environment,store,purchase_family_id,product_version_id,status,current_period_end,verified_at)
    values(customer,'SANDBOX','APP_STORE','rc-subscription:deletion-review',product,'active',now()+interval '1 month',now());
  insert into public.native_product_versions(environment,store,product_id,package_version_id,name,kind,credits,max_source_photos_per_project)
    values('PRODUCTION','PLAY_STORE','deletion_review_monthly','20000000-0000-4000-8000-000000000002','immutable','subscription',50,20) returning id into product;
  insert into public.native_subscriptions(user_id,environment,store,purchase_family_id,product_version_id,status,current_period_end,verified_at)
    values(customer,'PRODUCTION','PLAY_STORE','rc-subscription:deletion-review-prod',product,'active',now()+interval '1 month',now());
  update private.mobile_account_settings set environment='SANDBOX';
  begin
    perform public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal1','SANDBOX');
    raise exception 'Disabled review unexpectedly succeeded';
  exception when sqlstate '55000' then null;end;
  update private.mobile_account_settings set review_enabled=true;
  result:=public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal1','SANDBOX');
  perform public.test_assert(result->>'canRequestDeletion'='false' and result->>'scope'='shared_furnio_account','Review is not a deletion request');
  perform public.test_assert(result->'counts'='{"projects":1,"storedAssets":1,"unfinishedJobs":1}'::jsonb,'Only owned unpurged files and work are counted');
  perform public.test_assert(result->'linkedProviders'='["apple","email"]'::jsonb,'No cross-account identities');
  perform public.test_assert(jsonb_array_length(result->'subscriptions')=3,'Customer, developer and sandbox Apple billing warnings included');
  perform public.test_assert(not exists(select 1 from jsonb_array_elements(result->'subscriptions') s where s->>'provider'='play_store'),'Production native billing excluded from sandbox review');
  perform public.test_assert(exists(select 1 from jsonb_array_elements(result->'subscriptions') s where s->>'context'='developer' and s->>'renewalNotCancelled'='0'),'Cancellation status accurately described');
  perform public.test_assert(result::text not like '%example.invalid%' and result::text not like '%Private property%' and result::text not like '%rc-subscription%' and result::text not like '%sub_account_review%','No PII, subscription IDs or property names returned');
  perform public.test_assert((select status='queued' from public.jobs where id=session) and (select email='deletion-fixture@example.invalid' and account_status='active' from public.profiles where id=customer),'No suspension, job cancellation or profile edit');
  perform public.test_assert((select count(*)=3 from public.subscriptions where id like 'sub_account_review%'),'Existing Stripe rows unchanged');

  begin
    perform public.get_mobile_account_deletion_review(customer,other_session,auth_time,'password','aal1','SANDBOX');
    raise exception 'Cross-account session accepted';
  exception when insufficient_privilege then null;end;
  foreach age in array array[now()-interval '5 minutes',now()+interval '31 seconds',auth_time+interval '1 second'] loop
    begin
      perform public.get_mobile_account_deletion_review(customer,session,age,'password','aal1','SANDBOX');
      raise exception 'Old, future or fabricated authentication time accepted';
    exception when insufficient_privilege then null;end;
  end loop;
  foreach method in array array['recovery','anonymous','refresh','unknown',null] loop
    begin
      perform public.get_mobile_account_deletion_review(customer,session,auth_time,method,'aal1','SANDBOX');
      raise exception 'Unsupported authentication method accepted';
    exception when insufficient_privilege then null;end;
  end loop;
  begin
    perform public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal1','PRODUCTION');
    raise exception 'Cross-environment review accepted';
  exception when sqlstate '55000' then null;end;
  update auth.sessions set not_after=now() where id=session;
  begin
    perform public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal1','SANDBOX');
    raise exception 'Expired session accepted';
  exception when insufficient_privilege then null;end;
  update auth.sessions set not_after=null,oauth_client_id=other_session where id=session;
  begin
    perform public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal1','SANDBOX');
    raise exception 'Delegated OAuth session accepted for account deletion';
  exception when insufficient_privilege then null;end;
  update auth.sessions set oauth_client_id=null where id=session;
  insert into auth.mfa_factors(id,user_id,status) values(session,customer,'verified');
  begin
    perform public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal1','SANDBOX');
    raise exception 'MFA requirement bypassed';
  exception when insufficient_privilege then null;end;
  begin
    perform public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal2','SANDBOX');
    raise exception 'Forged assurance accepted';
  exception when insufficient_privilege then null;end;
  update auth.sessions set aal='aal2' where id=session;
  perform public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal2','SANDBOX');
  update public.profiles set account_status='suspended' where id=customer;
  insert into public.api_consumers(id,user_id) values(session,customer);
  insert into public.admin_users(user_id,role,is_active) values(customer,'owner',true);
  result:=public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal2','SANDBOX');
  perform public.test_assert(result->>'accountAccess'='suspended' and result->>'hasDeveloperWorkspace'='true' and result->>'hasAdministratorRole'='true','Shared access is visible without blocking suspended account review');
  update auth.users set deleted_at=now() where id=customer;
  begin
    perform public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal2','SANDBOX');
    raise exception 'Deleted Auth user accepted';
  exception when insufficient_privilege then null;end;
  update auth.users set deleted_at=null where id=customer;
  delete from auth.sessions where id=session;
  begin
    perform public.get_mobile_account_deletion_review(customer,session,auth_time,'password','aal2','SANDBOX');
    raise exception 'Signed-out session accepted';
  exception when insufficient_privilege then null;end;
  perform public.test_assert(not has_function_privilege('anon','public.get_mobile_account_deletion_review(uuid,uuid,timestamptz,text,text,text)','execute'),'Anonymous cannot query another account');
  perform public.test_assert(not has_function_privilege('authenticated','public.get_mobile_account_deletion_review(uuid,uuid,timestamptz,text,text,text)','execute'),'Customer JWT cannot forge RPC identity');
  perform public.test_assert(has_function_privilege('service_role','public.get_mobile_account_deletion_review(uuid,uuid,timestamptz,text,text,text)','execute'),'Server has narrow review RPC');
  perform public.test_assert(not has_table_privilege('service_role','private.mobile_account_settings','update'),'Worker cannot enable review');
end $$;
rollback;
