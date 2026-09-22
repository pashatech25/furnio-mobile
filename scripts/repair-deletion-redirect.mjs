// Additive, narrowly scoped repair for the already-installed native app.
// Does not replace the Site URL, providers, credentials or any existing redirect.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {withNativeAuthRedirects} from './native-auth-redirects.mjs';
assert.deepEqual(process.argv.slice(2),['--apply']);
const credential=spawnSync('/usr/bin/security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',timeout:20000});
assert.equal(credential.status,0,'Existing Supabase CLI sign-in unavailable');
let token=credential.stdout.trim();
if(token.startsWith('go-keyring-base64:')) token=Buffer.from(token.slice(18),'base64').toString();
const url='https://api.supabase.com/v1/projects/sgsjkgfwgxmlqcgyuyeh/config/auth';
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
async function read(){
  const r=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});
  assert(r.ok,`Auth settings read failed (${r.status})`);
  return r.json();
}
const before=await read();
const uri_allow_list=withNativeAuthRedirects(before.uri_allow_list);
if(uri_allow_list!==before.uri_allow_list){
  const r=await fetch(url,{method:'PATCH',headers,body:JSON.stringify({uri_allow_list}),redirect:'error',signal:AbortSignal.timeout(20000)});
  assert(r.ok,`Deletion redirect update failed (${r.status})`);
  await r.body?.cancel();
}
const after=await read();
assert.equal(after.uri_allow_list,uri_allow_list);
for(const [key,value] of Object.entries(before)) if(key!=='uri_allow_list') assert.deepEqual(after[key],value,`Unrelated Auth setting changed: ${key}`);
console.log('Verified deletion flow callback registered. Site URL, all prior callbacks, Google/Apple providers, CAPTCHA, SMS, email and remaining Auth settings unchanged.');
