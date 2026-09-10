// Owner-authorized reviewer provisioning; no shared authentication policy changes.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const ref='sgsjkgfwgxmlqcgyuyeh';
const root='/Users/alipashaamidi/Dev/Furnio Mobile';
const path=`${root}/output/store-review-account.json`;
const mode=process.argv[2];
assert(['--inspect','--provision'].includes(mode));
const credential=spawnSync('security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8'});
assert.equal(credential.status,0);let token=credential.stdout.trim();
if(token.startsWith('go-keyring-base64:'))token=Buffer.from(token.slice(18),'base64').toString();
async function api(suffix,body){
 const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/${suffix}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 assert(r.ok,`Management request failed (${r.status}); body withheld`);return r.json();
}
const sql=query=>api('database/query/read-only',{query});
const packages=await sql("select id,key,name,interval,unit_amount_cents,currency,total_credits from public.billing_packages where active and purchase_audience='customer' order by unit_amount_cents");
if(mode==='--inspect'){
 console.log(packages);
 console.log(await sql("select pg_get_functiondef('public.admin_adjust_credits(uuid,integer,text,jsonb)'::regprocedure) as definition"));
 console.log(await sql("select proname,pg_get_function_identity_arguments(oid) as args from pg_proc where pronamespace='public'::regnamespace and (proname ilike '%credit%' or proname ilike '%entitlement%')"));
 process.exit(0);
}
assert.equal(spawnSync('git',['check-ignore','-q','output/store-review-account.json'],{cwd:root}).status,0);
const offer=packages.find(p=>p.currency.toLowerCase()==='usd'&&p.unit_amount_cents===5000);
assert(offer,'No exact $50 customer package; do not guess credit conversion');
const keys=await api('api-keys');
const key=keys.find(k=>k.name==='service_role'&&k.api_key?.startsWith('eyJ'));
assert(key,'Server credential unavailable');
const client=createClient(`https://${ref}.supabase.co`,key.api_key,{auth:{persistSession:false,autoRefreshToken:false}});
let account=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{email:'app-review@furnio.ai',password:randomBytes(30).toString('base64url'),projectRef:ref};
assert.equal(account.projectRef,ref);assert.equal(account.email,'app-review@furnio.ai');
const existing=await sql("select id,raw_app_meta_data->>'furnio_store_reviewer' as reviewer from auth.users where email='app-review@furnio.ai'");
if(existing.length){assert.equal(existing.length,1);assert.equal(existing[0].reviewer,'true');assert.equal(account.id,existing[0].id);}
else {
 writeFileSync(path,JSON.stringify(account),{mode:0o600,flag:'w'});
 const result=await client.auth.admin.createUser({email:account.email,password:account.password,email_confirm:true,app_metadata:{furnio_store_reviewer:true},user_metadata:{full_name:'Furnio App Review'}});
 assert(!result.error,`Reviewer creation failed (${result.error?.status}); details withheld`);
 account.id=result.data.user.id;writeFileSync(path,JSON.stringify(account),{mode:0o600});
}
assert(/^[0-9a-f-]{36}$/.test(account.id));
assert(Number.isInteger(offer.total_credits)&&offer.total_credits>0);
const audit=JSON.stringify({purpose:'Apple and Google store review',owner_authorized:true,usd_value_cents:5000,package_id:offer.id,phone_assurance:'Owner-authorized account-specific exemption; not SMS verification'}).replaceAll("'","''");
await api('database/query',{query:`begin; set local lock_timeout='2s';
 update public.profiles set phone_verification_required=false where id='${account.id}' and exists(select 1 from auth.users where id='${account.id}' and raw_app_meta_data->>'furnio_store_reviewer'='true');
 select pg_advisory_xact_lock(hashtextextended('${account.id}',0));
 select public.admin_adjust_credits('${account.id}',${offer.total_credits},'store-review-50usd:${account.id}','${audit}'::jsonb)
 where not exists(select 1 from public.credit_ledger where idempotency_key='store-review-50usd:${account.id}');
 commit;`});
const verified=await sql(`select p.account_status,p.phone_verification_required,(select sum(delta) from public.credit_ledger where user_id=p.id) as credits from public.profiles p where p.id='${account.id}'`);
assert.equal(verified[0]?.phone_verification_required,false);
account.creditGrant=offer.total_credits;account.usdValueCents=5000;writeFileSync(path,JSON.stringify(account),{mode:0o600});
// Server-issued reviewer session verifies authorization, not the interactive CAPTCHA UI.
const link=await client.auth.admin.generateLink({type:'magiclink',email:account.email});
assert(!link.error,'Reviewer session issuance failed');
const session=await client.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});
assert(!session.error&&session.data.session,'Reviewer session verification failed');
assert.equal(session.data.user.id,account.id);
try {
 for(const endpoint of ['/api/me','/api/trial']){
  const r=await fetch(`https://platform.furnio.ai${endpoint}`,{headers:{Authorization:`Bearer ${session.data.session.access_token}`},signal:AbortSignal.timeout(20000)});
  assert.equal(r.status,200,`Reviewer ${endpoint} failed`);
  const data=await r.json();
  if(endpoint==='/api/trial')assert.equal(data.trial.phoneRequired,false);
  console.log(`${endpoint}: customer access verified${endpoint==='/api/trial'?' without phone gate':''}`);
 }
} finally {await client.auth.signOut({scope:'local'});}
console.log({reviewerEmail:account.email,...verified[0],credentials:'Saved in ignored owner-only file; password withheld'});
