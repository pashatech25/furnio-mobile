-- Run only in the disposable synthetic ledger fixture. No provider IO.
begin;
create function public.fixture_email_snapshot(p_id uuid) returns jsonb language sql set search_path='' as $$
  select jsonb_build_object('user_id',e.user_id,'normalized_recipient',e.normalized_recipient,
    'template_id',e.template_id,'template_version',e.template_version,'payload',e.payload)
  from public.email_outbox e where id=p_id;
$$;
do $$
declare u uuid:='00000000-0000-4000-8000-000000000401'; other_u uuid:='00000000-0000-4000-8000-000000000402';
  session uuid:='10000000-0000-4000-8000-000000000401'; req uuid:='30000000-0000-4000-8000-000000000401';
  template uuid:='40000000-0000-4000-8000-000000000401';
  mail uuid:='50000000-0000-4000-8000-000000000401'; other_mail uuid:='50000000-0000-4000-8000-000000000402';
  raw_mail uuid:='50000000-0000-4000-8000-000000000403'; payload_mail uuid:='50000000-0000-4000-8000-000000000404';
  sent_mail uuid:='50000000-0000-4000-8000-000000000405'; late_mail uuid:='50000000-0000-4000-8000-000000000406';
  reused_mail uuid:='50000000-0000-4000-8000-000000000407'; r jsonb; before_snapshot jsonb; stamp timestamptz;
  t timestamptz:=date_trunc('second',now());
begin
  perform public.test_assert(not has_table_privilege('anon','private.mobile_account_email_fences','SELECT')
    and not has_table_privilege('authenticated','private.mobile_account_email_fences','SELECT')
    and not has_table_privilege('service_role','private.mobile_account_email_fences','SELECT'),'No raw suppression table API');
  perform public.test_assert(not has_function_privilege('anon','public.claim_mobile_account_email(uuid,jsonb)','EXECUTE')
    and not has_function_privilege('authenticated','public.claim_mobile_account_email(uuid,jsonb)','EXECUTE')
    and has_function_privilege('service_role','public.claim_mobile_account_email(uuid,jsonb)','EXECUTE'),'Only service dispatchers may authorize a message');
  perform public.test_assert(private.mobile_email_account_ids(null,'{"customer_id":"invalid","customer":{"id":"also invalid"}}')='{}','Malformed UUID fields are safely ignored');
  insert into auth.users(id) values(u),(other_u);
  insert into public.profiles(id,email) values(u,'delete-me@example.invalid'),(other_u,'keep-me@example.invalid');
  insert into auth.sessions(id,user_id) values(session,u);
  insert into auth.mfa_amr_claims(session_id,authentication_method,updated_at) values(session,'password',t);
  insert into public.email_templates(id,slug,display_name,category,event_type) values(template,'privacy_fixture','Fixture','product','test');
  insert into public.email_outbox(id,event_id,event_type,user_id,normalized_recipient,template_id,template_version,category,idempotency_key,status,payload)
  values
    (mail,mail,'test',u,'delete-me@example.invalid',template,1,'product',mail::text,'queued','{}'),
    (other_mail,other_mail,'test',other_u,'keep-me@example.invalid',template,1,'product',other_mail::text,'queued','{}'),
    (raw_mail,raw_mail,'test',null,'delete-me@example.invalid',template,1,'marketing',raw_mail::text,'scheduled','{}'),
    (payload_mail,payload_mail,'test',null,'admin@example.invalid',template,1,'admin',payload_mail::text,'scheduled',jsonb_build_object('customer_id',u)),
    (sent_mail,sent_mail,'test',u,'delete-me@example.invalid',template,1,'product',sent_mail::text,'sent','{}');
  before_snapshot:=public.fixture_email_snapshot(mail);
  r:=public.claim_mobile_account_email(mail,before_snapshot||'{"template_version":2}');
  perform public.test_assert(r->>'status'='stale' and (select attempt_count=0 and status='queued' from public.email_outbox where id=mail),'Stale template never claims a send');
  r:=public.claim_mobile_account_email(mail,before_snapshot);
  perform public.test_assert(r->>'status'='allowed' and (r->>'attempt')::int=1,'Fresh message claimed once');
  perform public.test_assert(public.claim_mobile_account_email(mail,before_snapshot)->>'status'='ambiguous','Concurrent/repeated claim cannot resend in-flight email');
  perform public.test_assert(public.claim_mobile_account_email(gen_random_uuid(),'{}')->>'status'='missing','Missing message is not send permission');
  update private.mobile_account_settings set environment='SANDBOX',review_enabled=true,requests_enabled=true,processor_ready=true;
  r:=public.manage_mobile_account_deletion_request('prepare','SANDBOX',req,repeat('e',64),u,session,t,'password','aal1');
  perform public.manage_mobile_account_deletion_request('confirm','SANDBOX',req,repeat('e',64),u,session,t,'password','aal1',
    (r->>'challenge')::uuid,'shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);
  perform private.begin_mobile_account_cleanup(req,'SANDBOX');
  perform public.test_assert((select count(*)=3 from public.email_outbox where id=any(array[mail,raw_mail,payload_mail])
    and status='cancelled' and deletion_suppressed_at is not null),'Fence cancels owned, raw-recipient and payload-attributed queued messages');
  perform public.test_assert((select status='queued' from public.email_outbox where id=other_mail),'Other customer queue unchanged');
  perform public.test_assert((select status='sent' from public.email_outbox where id=sent_mail),'Previously accepted delivery stays accurate');
  perform public.test_assert((select recipient_hash=encode(sha256(convert_to('delete-me@example.invalid','UTF8')),'hex')
    from private.mobile_account_email_fences where user_id=u),'Only normalized address digest is copied into private fence');
  perform public.test_assert(public.claim_mobile_account_email(mail,before_snapshot)->>'status'='blocked','Loaded-before-deletion message cannot get another claim');
  -- An already authorized external send may finish later. Preserve that evidence,
  -- but keep permanent suppression even if a later retention job redacts payload.
  update public.email_outbox set status='sent',provider_message_id='fixture-already-accepted',last_error_code=null where id=mail;
  select deletion_suppressed_at into stamp from public.email_outbox where id=mail;
  update public.email_outbox set status='queued',deletion_suppressed_at=null,last_error_code=null where id=mail;
  perform public.test_assert((select status='cancelled' and deletion_suppressed_at=stamp from public.email_outbox where id=mail),'A late terminal observation cannot remove permanent suppression');
  update public.email_outbox set payload='{}',deletion_suppressed_at=null,last_error_code=null where id=payload_mail;
  update public.email_outbox set status='queued' where id=payload_mail;
  perform public.test_assert((select status='cancelled' from public.email_outbox where id=payload_mail),'Redacting old context does not reactivate a message');
  begin update public.email_outbox set user_id=other_u,normalized_recipient='keep-me@example.invalid' where id=mail;
    raise exception 'Suppressed email reassigned'; exception when insufficient_privilege then null; end;
  -- Profile erasure later must not make unbound sends to the old address safe.
  update public.profiles set email=null where id=u;
  insert into public.email_outbox(id,event_id,event_type,normalized_recipient,template_id,template_version,category,idempotency_key)
    values(late_mail,late_mail,'test','delete-me@example.invalid',template,1,'product',late_mail::text);
  perform public.test_assert((select status='cancelled' from public.email_outbox where id=late_mail),'Address-only late send blocked after profile email erasure');
  -- Explicit new-account binding is distinct; email resemblance never merges IDs.
  update public.profiles set email='delete-me@example.invalid' where id=other_u;
  insert into public.email_outbox(id,event_id,event_type,user_id,normalized_recipient,template_id,template_version,category,idempotency_key)
    values(reused_mail,reused_mail,'test',other_u,'delete-me@example.invalid',template,1,'product',reused_mail::text);
  before_snapshot:=public.fixture_email_snapshot(reused_mail);
  set local role service_role;
  r:=public.claim_mobile_account_email(reused_mail,before_snapshot);
  reset role;
  perform public.test_assert(r->>'status'='allowed','Fresh explicitly bound identity retains normal email service');
  perform public.test_assert((select state='queued' from private.mobile_account_deletion_requests where id=req),'Email suppression is not completed account deletion');
end;$$;
rollback;
