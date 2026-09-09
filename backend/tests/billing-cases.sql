do $$
declare u1 uuid:='00000000-0000-4000-8000-000000000001'; u9 uuid:='00000000-0000-4000-8000-000000000009'; snapshot jsonb; product uuid;
begin
  snapshot:=public.get_mobile_billing_snapshot(u1,'SANDBOX','APP_STORE');
  perform public.test_assert(snapshot -> 'products'='[]','unpublished store catalog is hidden');
  perform public.test_assert((snapshot ->> 'acquisitionEnabled')::boolean=false,'native acquisition remains disabled');
  select id into product from public.native_product_versions where product_id='pack20';
  insert into public.native_product_availability(product_version_id,available) values(product,true);
  snapshot:=public.get_mobile_billing_snapshot(u1,'SANDBOX','APP_STORE');
  perform public.test_assert(jsonb_array_length(snapshot -> 'products')=1,'only explicitly available native products are shown');
  perform public.test_assert(snapshot -> 'products' -> 0 ->> 'credits'='20','catalog uses immutable package credits');
  snapshot:=public.get_mobile_billing_snapshot(u1,'SANDBOX','PLAY_STORE');
  perform public.test_assert(snapshot -> 'products'='[]','Apple product not shown for Google');
  snapshot:=public.get_mobile_billing_snapshot(u9,'SANDBOX','APP_STORE');
  perform public.test_assert(jsonb_array_length(snapshot -> 'subscriptions')=1,'native subscription visible');
  perform public.test_assert(snapshot -> 'subscription' ->> 'provider'='play_store','native provider attributed correctly even when reading from an Apple device');
  insert into public.subscriptions(id,user_id,status) values('sub_billing_duplicate',u9,'past_due');
  snapshot:=public.get_mobile_billing_snapshot(u9,'SANDBOX','APP_STORE');
  perform public.test_assert(jsonb_array_length(snapshot -> 'subscriptions')=2 and (snapshot ->> 'subscriptionConflict')::boolean,'all providers visible on duplicate subscription');
  perform public.test_assert((snapshot ->> 'balance')::integer=public.credit_balance(u9),'snapshot uses shared ledger balance');
  insert into public.subscriptions(id,user_id,status,billing_context) values('sub_developer_only',u9,'active','developer');
  snapshot:=public.get_mobile_billing_snapshot(u9,'SANDBOX','APP_STORE');
  perform public.test_assert(jsonb_array_length(snapshot -> 'subscriptions')=2,'developer subscription is not a customer-app plan');
  perform public.test_assert(not has_function_privilege('authenticated','public.get_mobile_billing_snapshot(uuid,text,text)','EXECUTE'),'customer cannot supply a different user ID to RPC');
  begin perform public.get_mobile_billing_snapshot(u1,'PRODUCTION','APP_STORE');raise exception 'wrong environment accepted';
    exception when sqlstate '55000' then null;end;
end;$$;
