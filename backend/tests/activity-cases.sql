do $$
declare u uuid:='00000000-0000-4000-8000-000000000011';other uuid:='00000000-0000-4000-8000-000000000012';page jsonb;second jsonb;project uuid:=gen_random_uuid();other_project uuid:=gen_random_uuid();
begin
  insert into public.projects(id,user_id,name) values(project,u,'Owned project'),(other_project,other,'PRIVATE OTHER PROJECT');
  for n in 1..30 loop
    insert into public.jobs(id,user_id,project_id,type,status,created_at,input) values(gen_random_uuid(),u,project,'stage_single','succeeded',now(),'{"prompt":"PRIVATE MASTER PROMPT","fal_request_id":"PRIVATE PROVIDER"}');
  end loop;
  insert into public.jobs(id,user_id,project_id,type,status,created_at) values(gen_random_uuid(),other,other_project,'stage_single','succeeded',now()+interval '1 day');
  page:=public.get_mobile_activity(u);
  perform public.test_assert(jsonb_array_length(page -> 'items')=25,'activity bounded to 25');
  perform public.test_assert(position('PRIVATE' in page::text)=0,'no prompts/provider internals/other customer data');
  second:=public.get_mobile_activity(u,(page -> 'nextCursor' ->> 'createdAt')::timestamptz,(page -> 'nextCursor' ->> 'id')::uuid);
  perform public.test_assert(jsonb_array_length(second -> 'items')=5 and second -> 'nextCursor'='null','activity uses stable tie-breaking cursor');
  perform public.test_assert(not exists(select 1 from jsonb_array_elements(page -> 'items') a join jsonb_array_elements(second -> 'items') b on a ->> 'id'=b ->> 'id'),'no duplicates across equal timestamp pages');
  perform public.test_assert(not has_function_privilege('authenticated','public.get_mobile_activity(uuid,timestamptz,uuid,integer)','EXECUTE'),'activity RPC service-only');
  begin perform public.get_mobile_activity(u,now(),null);raise exception 'invalid cursor accepted';exception when sqlstate '22023' then null;end;
end;$$;
