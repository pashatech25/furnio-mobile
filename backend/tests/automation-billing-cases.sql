begin;
insert into public.profiles(id,email,created_at) values
 ('00000000-0000-4000-8000-000000000701','apple-auto@example.invalid',now()-interval '4 days'),
 ('00000000-0000-4000-8000-000000000702','google-auto@example.invalid',now()-interval '3 days'),
 ('00000000-0000-4000-8000-000000000703','web-auto@example.invalid',now()-interval '2 days'),
 ('00000000-0000-4000-8000-000000000704','empty-auto@example.invalid',now()-interval '1 day'),
 ('00000000-0000-4000-8000-000000000705','pack-auto@example.invalid',now()),
 ('00000000-0000-4000-8000-000000000706','developer-auto@example.invalid',now()),
 ('00000000-0000-4000-8000-000000000707','other-env-auto@example.invalid',now());
insert into public.native_product_versions(environment,store,product_id,package_version_id) values
 ('SANDBOX','APP_STORE','auto-monthly','20000000-0000-4000-8000-000000000002'),
 ('PRODUCTION','APP_STORE','auto-production','20000000-0000-4000-8000-000000000002');
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000701','SANDBOX','APP_STORE','auto-apple','rc-subscription:auto-apple','auto-monthly',now(),now()+interval '1 month');
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000702','SANDBOX','PLAY_STORE','auto-google','rc-subscription:auto-google','monthly50',now(),now()+interval '1 month');
select public.record_verified_native_purchase('00000000-0000-4000-8000-000000000705','SANDBOX','APP_STORE','auto-pack','rc-purchase:auto-pack','pack20',now());
insert into public.subscriptions(id,user_id,status,billing_context) values
 ('sub_auto_web','00000000-0000-4000-8000-000000000703','active','customer'),
 ('sub_auto_developer','00000000-0000-4000-8000-000000000706','active','developer');
insert into public.native_subscriptions(user_id,environment,store,purchase_family_id,product_version_id,status,current_period_end,verified_at)
 select '00000000-0000-4000-8000-000000000707','PRODUCTION','APP_STORE','auto-other-env',id,'active',now()+interval '1 month',now()
 from public.native_product_versions where product_id='auto-production';
create function pg_temp.auto_ids(state text) returns setof uuid language sql as $$
  select (item->>'id')::uuid from jsonb_array_elements(public.get_native_automation_customers('SANDBOX',state,'any')) item;
$$;
do $$
declare rows jsonb; customer jsonb; state text; expected text; original_credits integer;
  apple uuid:='00000000-0000-4000-8000-000000000701'; signature text:='public.get_native_automation_customers(text,text,text,timestamptz,numeric,numeric,integer,boolean,text,text)';
begin
  update private.native_commerce_settings set customer_compatibility_enabled=false;
  begin perform public.get_native_automation_customers('SANDBOX'); raise exception 'Disabled reader returned customers';
  exception when sqlstate '55000' then null; end;
  update private.native_commerce_settings set customer_compatibility_enabled=true,acquisition_enabled=false;
  begin perform public.get_native_automation_customers('PRODUCTION'); raise exception 'Cross-environment reader returned customers';
  exception when sqlstate '55000' then null; end;
  begin perform public.get_native_automation_customers(null); raise exception 'Missing environment accepted';
  exception when sqlstate '55000' then null; end;
  perform public.test_assert(not exists(select 1 from pg_temp.auto_ids('none') id where id in (apple,'00000000-0000-4000-8000-000000000702','00000000-0000-4000-8000-000000000703')),'All three paying providers excluded from no-subscription audience');
  perform public.test_assert((select count(*)=4 from pg_temp.auto_ids('none') id where id in ('00000000-0000-4000-8000-000000000704','00000000-0000-4000-8000-000000000705','00000000-0000-4000-8000-000000000706','00000000-0000-4000-8000-000000000707')),'No plan, credit pack, developer-only and other environment preserve customer subscription semantics');
  perform public.test_assert((select count(*)=3 from pg_temp.auto_ids('active') id where id in (apple,'00000000-0000-4000-8000-000000000702','00000000-0000-4000-8000-000000000703')),'All three providers support Active filter');
  rows:=public.get_native_automation_customers('SANDBOX','any','any',p_lookup_by=>'email',p_lookup_value=>'apple-auto@example.invalid',p_limit=>2);
  customer:=rows->0;
  perform public.test_assert(jsonb_array_length(rows)=1 and customer->>'id'=apple::text,'Exact lookup includes native snapshot');
  perform public.test_assert(customer->'subscription_id'='null'::jsonb and customer->'subscription_status'='null'::jsonb,'Native IDs/status never replace legacy Stripe columns');
  perform public.test_assert(customer#>>'{billing,has_subscription}'='true' and customer#>'{billing,providers}'='["app_store"]'::jsonb,'Cross-provider billing is explicit');
  original_credits:=public.credit_balance(apple);
  foreach state in array array['active','trialing','grace_period','billing_retry','expired','revoked'] loop
    update public.native_subscriptions set status=state,cancel_at_period_end=true,current_period_end=now()+interval '1 month' where user_id=apple;
    expected:=case when state in ('grace_period','billing_retry') then 'past_due' when state in ('expired','revoked') then 'canceled' else state end;
    perform public.test_assert(exists(select 1 from pg_temp.auto_ids(expected) id where id=apple),'Native filter mapping: '||state);
    perform public.test_assert(not exists(select 1 from pg_temp.auto_ids('none') id where id=apple),'History never mistaken for never-subscribed: '||state);
    perform public.test_assert(exists(select 1 from pg_temp.auto_ids('subscribed') id where id=apple),'Any subscription includes recorded history: '||state);
  end loop;
  update public.native_subscriptions set status='active',current_period_end=now()-interval '1 minute' where user_id=apple;
  customer:=public.get_native_automation_customers('SANDBOX','any','any',p_lookup_by=>'id',p_lookup_value=>apple::text,p_limit=>2)->0;
  perform public.test_assert(customer#>>'{billing,needs_reconciliation}'='true' and not exists(select 1 from pg_temp.auto_ids('active') id where id=apple),'Late expiration is explicit uncertainty, not a false active or never-subscribed classification');
  perform public.test_assert(public.credit_balance(apple)=original_credits,'Reader/status checks never alter credits');
  -- An overlap retains both statuses; latest Stripe state cannot hide native.
  insert into public.subscriptions(id,user_id,status) values('sub_auto_overlap',apple,'past_due');
  update public.native_subscriptions set status='active',current_period_end=now()+interval '1 month' where user_id=apple;
  perform public.test_assert(exists(select 1 from pg_temp.auto_ids('active') id where id=apple) and exists(select 1 from pg_temp.auto_ids('past_due') id where id=apple),'Multiple provider states remain filterable');
  customer:=public.get_native_automation_customers('SANDBOX','any','any',p_lookup_by=>'id',p_lookup_value=>apple::text,p_limit=>2)->0;
  perform public.test_assert(customer->>'subscription_id'='sub_auto_overlap' and customer->>'subscription_status'='past_due','Existing Stripe identifiers and status remain unchanged');
  perform public.test_assert(customer#>'{billing,providers}'='["stripe","app_store"]'::jsonb,'Provider list identifies overlap');
  perform public.test_assert(customer::text not like '%rc-subscription%' and customer::text not like '%auto-monthly%','No native provider identifiers exposed');
  rows:=public.get_native_automation_customers('SANDBOX','any','any',p_registered_before=>now()-interval '2 days',p_min_credits=>50,p_max_credits=>50);
  perform public.test_assert(exists(select 1 from jsonb_array_elements(rows) r where r->>'id'=apple::text) and not exists(select 1 from jsonb_array_elements(rows) r where r->>'id'='00000000-0000-4000-8000-000000000705'),'Age and both credit bounds apply together');
  rows:=public.get_native_automation_customers('SANDBOX','any','any',p_limit=>1,p_newest=>true);
  perform public.test_assert(jsonb_array_length(rows)=1,'Limit enforced in database');
  rows:=public.get_native_automation_customers('SANDBOX','any','any',p_min_credits=>49.5,p_max_credits=>50.5);
  perform public.test_assert(exists(select 1 from jsonb_array_elements(rows) r where r->>'id'=apple::text),'Decimal filter bounds retain original comparison semantics');
  begin perform public.get_native_automation_customers('SANDBOX',p_min_credits=>'NaN'::numeric); raise exception 'NaN accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.get_native_automation_customers('SANDBOX',p_limit=>251); raise exception 'Unbounded query accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.get_native_automation_customers('SANDBOX',p_subscription_status=>'bogus'); raise exception 'Invalid status accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.get_native_automation_customers('SANDBOX',p_lookup_by=>'email',p_lookup_value=>'apple-auto@example.invalid'); raise exception 'Unbounded lookup accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.get_native_automation_customers('SANDBOX',p_min_credits=>51,p_max_credits=>50); raise exception 'Inverted bounds accepted'; exception when sqlstate '22023' then null; end;
  perform public.test_assert(not has_function_privilege('anon',signature,'execute') and not has_function_privilege('authenticated',signature,'execute') and has_function_privilege('service_role',signature,'execute'),'Only trusted backend can query customers');
end $$;
set local role service_role;
select public.get_native_automation_customers('SANDBOX','any','any',p_limit=>1);
reset role;
set local role authenticated;
do $$ begin
  perform public.get_native_automation_customers('SANDBOX'); raise exception 'Customer role read all customers';
exception when insufficient_privilege then null; end $$;
reset role;
rollback;
