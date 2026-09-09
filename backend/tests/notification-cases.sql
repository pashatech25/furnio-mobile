begin;
do $$
declare
  project uuid:='77777777-7777-4777-8777-777777777777';
  install uuid:='88888888-8888-4888-8888-888888888888';
  customer uuid:='00000000-0000-4000-8000-000000000017';
  other_customer uuid:='00000000-0000-4000-8000-000000000018';
  job uuid:='99999999-9999-4999-8999-999999999999';
  token text:='ExpoPushToken[notification_fixture_token]';
  result jsonb;claim jsonb;delivery jsonb;device uuid;
begin
  update private.mobile_push_settings set eas_project_id=project;
  begin
    perform public.manage_mobile_push_device('staging',project,install,repeat('a',64),1,'register',customer,'ios',token);
    raise exception 'Disabled registration unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  update private.mobile_push_settings set enabled=true;
  perform public.manage_mobile_push_device('staging',project,install,repeat('a',64),1,'prepare',customer);
  result:=public.manage_mobile_push_device('staging',project,install,repeat('a',64),2,'register',customer,'ios',token);
  perform public.test_assert(result->>'enabled'='true','Opt-in registration');
  select id into device from private.mobile_push_devices where installation_id=install;
  perform public.test_assert(public.manage_mobile_push_device('staging',project,install,repeat('a',64),1,'status',other_customer)->>'enabled'='false','Other customer cannot read enabled state');
  begin
    perform public.manage_mobile_push_device('staging',project,install,repeat('b',64),2,'disable');
    raise exception 'Wrong installation secret accepted';
  exception when insufficient_privilege then null;end;
  begin
    perform public.manage_mobile_push_device('production',project,install,repeat('a',64),2,'disable');
    raise exception 'Wrong environment accepted';
  exception when insufficient_privilege then null;end;
  -- Synthetic timestamps stand in for completion after registration.
  update private.mobile_push_devices set enabled_at=now()-interval '1 hour' where id=device;
  insert into public.jobs(id,user_id,type,status,finished_at) values(job,customer,'stage_single','succeeded',now()-interval '1 minute');
  claim:=public.claim_mobile_push_deliveries('staging',project);
  perform public.test_assert(jsonb_array_length(claim)=1,'One finished owned job queued');
  perform public.test_assert(jsonb_array_length(public.claim_mobile_push_deliveries('staging',project))=0,'Cron lease and dedupe');
  delivery:=public.read_mobile_push_delivery('staging',project,(claim->0->>'id')::uuid,(claim->0->>'leaseId')::uuid);
  perform public.test_assert(delivery->>'phase'='send' and delivery->>'pushToken'=token,'Fresh recipient validated');
  perform public.finish_mobile_push_delivery('staging',project,(claim->0->>'id')::uuid,(claim->0->>'leaseId')::uuid,'sent','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  perform public.test_assert((select state='ticket' and next_attempt_at>=now()+interval '15 minutes' from private.mobile_push_deliveries where device_id=device),'Ticket is not device delivery; receipt delayed');
  update private.mobile_push_deliveries set next_attempt_at=now() where device_id=device;
  claim:=public.claim_mobile_push_deliveries('staging',project);
  delivery:=public.read_mobile_push_delivery('staging',project,(claim->0->>'id')::uuid,(claim->0->>'leaseId')::uuid);
  perform public.test_assert(delivery->>'phase'='receipt','Receipt polling phase');
  -- Token/account switch invalidates the in-flight receipt lease and queue.
  perform public.manage_mobile_push_device('staging',project,install,repeat('a',64),3,'register',other_customer,'ios','ExpoPushToken[replacement_fixture_token]');
  perform public.finish_mobile_push_delivery('staging',project,(claim->0->>'id')::uuid,(claim->0->>'leaseId')::uuid,'invalid',null,'unregistered');
  perform public.test_assert((select enabled and user_id=other_customer from private.mobile_push_devices where id=device),'Old invalid-token receipt cannot disable new account');
  perform public.test_assert((select state='cancelled' from private.mobile_push_deliveries where device_id=device),'Account switch cancels prior queue');
  perform public.manage_mobile_push_device('staging',project,install,repeat('a',64),4,'disable');
  begin
    perform public.manage_mobile_push_device('staging',project,install,repeat('a',64),3,'register',customer,'ios',token);
    raise exception 'Stale enable unexpectedly succeeded';
  exception when check_violation then null;end;
  perform public.test_assert((select not enabled and user_id is null and push_token is null from private.mobile_push_devices where id=device),'Disable removes recipient data');
  perform public.manage_mobile_push_device('staging',project,install,repeat('a',64),4,'disable');
  -- Anonymous callers cannot create installation records, and a late registration
  -- without acknowledged preparation cannot enable notifications.
  perform public.manage_mobile_push_device('staging',project,'88888888-8888-4888-8888-888888888889',repeat('b',64),2,'disable');
  begin
    perform public.manage_mobile_push_device('staging',project,'88888888-8888-4888-8888-888888888889',repeat('b',64),1,'register',customer,'ios',token);
    raise exception 'Out-of-order first registration succeeded';
  exception when insufficient_privilege then null;end;
  perform public.test_assert(not exists(select 1 from private.mobile_push_devices where installation_id='88888888-8888-4888-8888-888888888889'),'Anonymous disable creates no record');
  update private.mobile_push_settings set enabled=false;
  perform public.manage_mobile_push_device('staging',project,install,repeat('a',64),5,'disable');
  perform public.test_assert(not has_function_privilege('authenticated','public.manage_mobile_push_device(text,uuid,uuid,text,integer,text,uuid,text,text)','execute'),'No direct customer RPC access');
  perform public.test_assert(not has_table_privilege('service_role','private.mobile_push_devices','select'),'No generic service-role token reads');
  perform public.test_assert(has_function_privilege('service_role','public.claim_mobile_push_deliveries(text,uuid)','execute'),'Narrow worker dispatch privilege');
  perform public.test_assert(not exists(select 1 from pg_trigger where tgrelid='public.jobs'::regclass and tgname like '%mobile%'
    and tgname not in ('mobile_account_jobs_guard','mobile_account_deleted_job_scope')),
    'No notification trigger on imaging jobs; only the separately tested account fence/retention guards are allowed');
end $$;
do $$
declare project uuid:='77777777-7777-4777-8777-777777777777';install uuid:='88888888-8888-4888-8888-888888888889';
  customer uuid:='00000000-0000-4000-8000-000000000017';device uuid;claim jsonb;attempt integer;
begin
  update private.mobile_push_settings set enabled=true;
  perform public.manage_mobile_push_device('staging',project,install,repeat('b',64),1,'prepare',customer);
  perform public.manage_mobile_push_device('staging',project,install,repeat('b',64),2,'register',customer,'android','ExpoPushToken[retry_fixture_token]');
  select id into device from private.mobile_push_devices where installation_id=install;
  update private.mobile_push_devices set enabled_at=now()-interval '1 hour' where id=device;
  for attempt in 1..5 loop
    claim:=public.claim_mobile_push_deliveries('staging',project);
    perform public.test_assert(jsonb_array_length(claim)=1,'Bounded retriable delivery');
    perform public.finish_mobile_push_delivery('staging',project,(claim->0->>'id')::uuid,(claim->0->>'leaseId')::uuid,'retry',null,'transient');
    perform public.test_assert((select next_attempt_at>=now()+interval '2 minutes' from private.mobile_push_deliveries where device_id=device),'Durable backoff');
    update private.mobile_push_deliveries set next_attempt_at=now() where device_id=device;
  end loop;
  perform public.test_assert(jsonb_array_length(public.claim_mobile_push_deliveries('staging',project))=0,'Send attempts stop after five');
  perform public.test_assert((select state='failed' and attempts=5 from private.mobile_push_deliveries where device_id=device),'Exhausted send is retained for follow-up');
  insert into public.jobs(id,user_id,type,status,finished_at) values('99999999-9999-4999-8999-999999999998',customer,'stage_single','failed',now()-interval '1 minute');
  claim:=public.claim_mobile_push_deliveries('staging',project);
  perform public.test_assert(jsonb_array_length(claim)=1,'Failed job gets generic update too');
  perform public.finish_mobile_push_delivery('staging',project,(claim->0->>'id')::uuid,(claim->0->>'leaseId')::uuid,'sent','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  update private.mobile_push_deliveries set next_attempt_at=now() where device_id=device and state='ticket';
  claim:=public.claim_mobile_push_deliveries('staging',project);
  perform public.finish_mobile_push_delivery('staging',project,(claim->0->>'id')::uuid,(claim->0->>'leaseId')::uuid,'resend',null,'transient');
  perform public.test_assert((select state='pending' and ticket_id is null from private.mobile_push_deliveries where id=(claim->0->>'id')::uuid),'Provider-declared rate failure permits bounded resend');
  update private.mobile_push_deliveries set next_attempt_at=now() where device_id=device and state='pending';
  claim:=public.claim_mobile_push_deliveries('staging',project);
  update public.profiles set account_status='suspended' where id=customer;
  perform public.test_assert(public.read_mobile_push_delivery('staging',project,(claim->0->>'id')::uuid,(claim->0->>'leaseId')::uuid) is null,'Suspension rechecked immediately before send');
  update public.profiles set account_status='active' where id=customer;
  update private.mobile_push_devices set lease_until=now()-interval '1 minute' where id=device;
  perform public.claim_mobile_push_deliveries('staging',project);
  perform public.test_assert((select not enabled and user_id is null and push_token is null from private.mobile_push_devices where id=device),'Expired registration removes recipient data');
end $$;
rollback;
