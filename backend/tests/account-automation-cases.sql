-- Synthetic SQL only. No flow execution, webhook, email, provider or live DB.
begin;
create function public.fixture_automation_snapshot(p_id uuid) returns jsonb language sql set search_path='' as $$
  select jsonb_build_object('context',r.context,'current_node_id',r.current_node_id,'flow_id',r.flow_id,
    'flow_version',r.flow_version,'is_test',r.is_test) from public.automation_runs r where id=p_id;
$$;
do $$
declare u uuid:='00000000-0000-4000-8000-000000000421'; other_u uuid:='00000000-0000-4000-8000-000000000422';
  session uuid:='10000000-0000-4000-8000-000000000421'; req uuid:='30000000-0000-4000-8000-000000000421';
  flow uuid:='40000000-0000-4000-8000-000000000421'; event_id uuid:='50000000-0000-4000-8000-000000000421';
  run_id uuid:='60000000-0000-4000-8000-000000000421'; other_run uuid:='60000000-0000-4000-8000-000000000422';
  mixed_run uuid:='60000000-0000-4000-8000-000000000423'; event_run uuid:='60000000-0000-4000-8000-000000000424';
  delivery uuid:='70000000-0000-4000-8000-000000000421'; sent_delivery uuid:='70000000-0000-4000-8000-000000000422';
  destination uuid:='80000000-0000-4000-8000-000000000421'; r jsonb; snapshot jsonb; stamp timestamptz;
  t timestamptz:=date_trunc('second',now());
begin
  perform public.test_assert(not has_function_privilege('anon','public.check_mobile_automation_work(text,uuid,jsonb)','EXECUTE')
    and not has_function_privilege('authenticated','public.check_mobile_automation_work(text,uuid,jsonb)','EXECUTE')
    and has_function_privilege('service_role','public.check_mobile_automation_work(text,uuid,jsonb)','EXECUTE'),'Only trusted worker can check automation work');
  perform public.test_assert(not has_function_privilege('anon','public.filter_mobile_automation_customers(uuid[])','EXECUTE')
    and not has_function_privilege('authenticated','private.mobile_automation_record_ids(text,jsonb)','EXECUTE'),'No customer identity enumeration RPC');
  perform public.test_assert(private.mobile_automation_account_ids(null,null,'{"id":"00000000-0000-4000-8000-000000000421","user_id":"bad","customers":null}')='{}','Arbitrary IDs and malformed values ignored');
  perform public.test_assert(private.mobile_automation_account_ids('customer',u::text,jsonb_build_object('nested',
    jsonb_build_object('customers',jsonb_build_array(jsonb_build_object('id',other_u),jsonb_build_object('id',u)))))=array[u,other_u],'Nested collections and explicit subjects deduplicated');
  insert into auth.users(id) values(u),(other_u);
  insert into public.profiles(id,email) values(u,'automation-delete@example.invalid'),(other_u,'automation-keep@example.invalid');
  insert into auth.sessions(id,user_id) values(session,u);
  insert into auth.mfa_amr_claims(session_id,authentication_method,updated_at) values(session,'password',t);
  insert into public.automation_flows(id,name) values(flow,'Isolated privacy fixture');
  insert into public.automation_events(id,event_type,occurred_at,subject_type,subject_id,idempotency_key,payload)
    values(event_id,'test',now(),'customer',u::text,event_id::text,'{}');
  insert into public.automation_runs(id,flow_id,flow_version,status,context,current_node_id) values
    (run_id,flow,1,'waiting',jsonb_build_object('customer_id',u),'wait-node'),
    (other_run,flow,1,'queued',jsonb_build_object('customer_id',other_u),'trigger'),
    (mixed_run,flow,1,'queued',jsonb_build_object('customers',jsonb_build_array(jsonb_build_object('id',u),jsonb_build_object('id',other_u))),'trigger');
  insert into public.automation_runs(id,flow_id,flow_version,event_id) values(event_run,flow,1,event_id);
  insert into public.automation_waits(run_id,node_id,resume_at,status,idempotency_key) values(run_id,'wait-node',now(),'claimed','privacy-wait');
  insert into public.outbound_destination_allowlist(id,hostname,purpose) values(destination,'webhook.example.invalid','Isolated privacy fixture');
  insert into public.automation_webhook_deliveries(id,run_id,flow_id,flow_version,node_id,destination_id,customer_id,idempotency_key,endpoint_path,event_name,status)
    values(delivery,run_id,flow,1,'send',destination,u,delivery::text,'/test','test.privacy','pending'),
      (sent_delivery,run_id,flow,1,'send',destination,u,sent_delivery::text,'/test','test.privacy','sent');
  snapshot:=public.fixture_automation_snapshot(run_id);
  set local role service_role;
  r:=public.check_mobile_automation_work('run',run_id,snapshot);
  reset role;
  perform public.test_assert(r->>'status'='allowed','Exact active snapshot allowed under service role');
  perform public.test_assert(public.check_mobile_automation_work('run',run_id,snapshot||'{"is_test":true}')->>'status'='stale','Test/live change invalidates loaded snapshot');
  perform public.test_assert(public.check_mobile_automation_work('run',gen_random_uuid(),snapshot)->>'status'='missing','Missing is never allowed');
  update private.mobile_account_settings set environment='SANDBOX',review_enabled=true,requests_enabled=true,processor_ready=true;
  r:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',req,repeat('a',64),u,session,t,'password','aal1');
  perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',req,repeat('a',64),u,session,t,'password','aal1',
    (r->>'challenge')::uuid,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
  perform private.begin_mobile_account_cleanup(req,'SANDBOX');
  perform public.test_assert((select status='ignored' and deletion_suppressed_at is not null from public.automation_events where id=event_id),'Pending event suppressed');
  perform public.test_assert((select count(*)=3 from public.automation_runs where id=any(array[run_id,mixed_run,event_run]) and status='cancelled' and deletion_suppressed_at is not null),'Owned, mixed and event-associated runs suppressed');
  perform public.test_assert((select status='cancelled' and deletion_suppressed_at is not null from public.automation_waits where idempotency_key='privacy-wait'),'Claimed wait cannot resume');
  perform public.test_assert((select status='skipped' and deletion_suppressed_at is not null from public.automation_webhook_deliveries where id=delivery),'Queued webhook suppressed');
  perform public.test_assert((select status='sent' from public.automation_webhook_deliveries where id=sent_delivery),'Already sent observation preserved');
  perform public.test_assert(public.check_mobile_automation_work('run',run_id,snapshot)->>'status'='blocked','Old in-memory snapshot denied');
  perform public.test_assert(public.check_mobile_automation_work('run',other_run,public.fixture_automation_snapshot(other_run))->>'status'='allowed','Unrelated customer still allowed');
  perform public.test_assert(public.filter_mobile_automation_customers(array[u,other_u])=array[other_u],'New searches omit deleting account');
  select deletion_suppressed_at into stamp from public.automation_runs where id=run_id;
  update public.automation_runs set context='{}',subject_id=null,event_id=null,deletion_suppressed_at=null,status='running' where id=run_id;
  perform public.test_assert((select status='cancelled' and deletion_suppressed_at=stamp from public.automation_runs where id=run_id),'Context redaction and stale retries cannot remove run suppression');
  update public.automation_waits set status='resumed',deletion_suppressed_at=null where idempotency_key='privacy-wait';
  perform public.test_assert((select status='cancelled' from public.automation_waits where idempotency_key='privacy-wait'),'Stale resume PATCH stays cancelled');
  update public.automation_webhook_deliveries set status='sent' where id=delivery;
  perform public.test_assert((select status='sent' from public.automation_webhook_deliveries where id=delivery),'Late real HTTP acceptance can be recorded');
  update public.automation_webhook_deliveries set status='pending',deletion_suppressed_at=null,customer_id=other_u,run_id=other_run where id=delivery;
  perform public.test_assert((select status='skipped' and deletion_suppressed_at is not null from public.automation_webhook_deliveries where id=delivery),'Rebinding cannot restart suppressed delivery');
  set local role service_role;
  insert into public.automation_runs(flow_id,flow_version,context) values(flow,1,jsonb_build_object('customer',jsonb_build_object('id',u)));
  update public.automation_runs set status='queued',deletion_suppressed_at=null where id=run_id;
  reset role;
  perform public.test_assert(not has_table_privilege('anon','public.automation_runs','SELECT')
    and not has_table_privilege('authenticated','public.automation_webhook_deliveries','UPDATE'),'Existing browser table isolation retained');
  perform public.test_assert((select bool_and(status='cancelled') from public.automation_runs where context#>>'{customer,id}'=u::text),'Late insert suppressed by fence');
  perform public.test_assert((select state='queued' from private.mobile_account_deletion_requests where id=req),'Automation suppression is not completion of deletion');
end;$$;
rollback;
