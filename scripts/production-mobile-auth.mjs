// Owner-authorized, additive native callback registration. No web URL/provider
// credentials, CAPTCHA setting, phone limit or customer record is replaced.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const mode=process.argv[2];assert.equal(process.argv.length,3);
assert(['--inspect','--configure-callbacks','--prepare-support-secret','--activity-read'].includes(mode));
const root='/Users/alipashaamidi/Dev/Furnio Mobile';
const ref='sgsjkgfwgxmlqcgyuyeh';
const credential=spawnSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8'});
assert.equal(credential.status,0);let token=credential.stdout.trim();
if(token.startsWith('go-keyring-base64:'))token=Buffer.from(token.slice(18),'base64').toString();
assert(/^sbp_(oauth_)?[a-f0-9]{40}$/.test(token));
async function api(path,body){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});assert(r.ok,`Supabase operation failed (${r.status}); details withheld`);return r.json();}
if(mode==='--activity-read'){
 const state=await api('database/query/read-only',{query:"select to_regprocedure('public.get_mobile_activity(uuid,timestamptz,uuid,integer)') is not null as ready"});
 if(!state[0]?.ready){
  const sql=readFileSync('/Users/alipashaamidi/Dev/AI Virtual Staging/supabase/migrations/20260909051332_mobile_activity_read.sql','utf8');
  assert(sql.startsWith('begin;'));assert(sql.includes('revoke all on function'));
  await api('database/query',{query:sql.replace('begin;',"begin; set local lock_timeout='2s'; set local statement_timeout='20s';")});
 }
 const result=await api('database/query/read-only',{query:"select to_regprocedure('public.get_mobile_activity(uuid,timestamptz,uuid,integer)') is not null as ready, has_function_privilege('anon','public.get_mobile_activity(uuid,timestamptz,uuid,integer)','EXECUTE') as anon_access,has_function_privilege('authenticated','public.get_mobile_activity(uuid,timestamptz,uuid,integer)','EXECUTE') as customer_direct_access"});
 assert.equal(result[0]?.ready,true);assert.equal(result[0]?.anon_access,false);assert.equal(result[0]?.customer_direct_access,false);console.log('Production read-only activity function ready; anonymous and direct customer execution denied. No customer records changed.');
}else if(mode==='--inspect'){
 console.log(await api('database/query/read-only',{query:"select to_regprocedure('public.get_mobile_activity(uuid,timestamptz,uuid,integer)') is not null as mobile_activity_exists,to_regprocedure('public.create_authorized_catalog_asset(uuid,uuid,uuid,text,text,bigint,integer)') is not null as catalog_exact_signature_exists"}));
 const v=await api('config/auth');console.log({nativeRedirects:(v.uri_allow_list??'').split(',').filter(u=>u.startsWith('furnio:')),appleEnabled:v.external_apple_enabled,appleAudience:v.external_apple_client_id,googleEnabled:v.external_google_enabled});
}else if(mode==='--configure-callbacks'){
 const before=await api('config/auth');writeFileSync(`${root}/output/production-auth-before-native.json`,JSON.stringify(before),{mode:0o600});
 const redirects=new Set((before.uri_allow_list??'').split(',').filter(Boolean));for(const uri of ['furnio://auth/callback','furnio://auth/callback?type=recovery','furnio://auth/deletion-callback'])redirects.add(uri);
 const audiences=new Set((before.external_apple_client_id??'').split(',').filter(Boolean));audiences.add('ai.furnio.app');
 const patch={uri_allow_list:[...redirects].join(','),external_apple_enabled:true,external_apple_client_id:[...audiences].join(',')};
 const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(patch),redirect:'error',signal:AbortSignal.timeout(20000)});assert(r.ok,`Native callback update failed (${r.status})`);await r.body?.cancel();
 const after=await api('config/auth');for(const [k,v]of Object.entries(before))if(!(k in patch))assert.deepEqual(after[k],v,`Unexpected unrelated Auth change: ${k}`);for(const[k,v]of Object.entries(patch))assert.deepEqual(after[k],v);
 console.log('Added three native callback URLs and native Apple audience. All previous redirects, Google settings, SMTP, SMS, CAPTCHA and Auth limits verified unchanged. No account created.');
}else{
 const keys=await api('api-keys');assert(Array.isArray(keys));const key=keys.find(k=>k.type==='secret'&&k.api_key?.startsWith('sb_secret_'));assert(key,'No existing modern server key available');
 const path='.env.production-mobile-server.local';assert.equal(spawnSync('git',['check-ignore','-q',path],{cwd:root}).status,0);
 writeFileSync(`${root}/${path}`,JSON.stringify({SUPABASE_SERVICE_ROLE_KEY:key.api_key}),{mode:0o600});
 console.log('Prepared existing production server credential for the isolated support Worker only, in an ignored owner-only file. No new key created; never copied to the app.');
}
