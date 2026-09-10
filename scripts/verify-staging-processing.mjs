// Hosted preflight only: malformed requests cannot create jobs or incur FAL use.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {root,stagingRef,stagingSql} from './staging-db.mjs';
assert.deepEqual(process.argv.slice(2), ['--preflight']);
const keys=parseEnv(readFileSync(`${root}/.env.staging-api.local`,'utf8'));
const fixtures=JSON.parse(readFileSync(`${root}/output/staging-customers.json`,'utf8'));
assert.equal(keys.SUPABASE_PROJECT_REF,stagingRef);
assert.equal(fixtures.projectRef,stagingRef);
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(`https://${stagingRef}.supabase.co`,keys.SUPABASE_SECRET_KEY,options);
const client=createClient(`https://${stagingRef}.supabase.co`,keys.SUPABASE_PUBLISHABLE_KEY,options);
const fixture=fixtures.customers.find(c=>c.label==='owner');
assert.equal(fixture.email,'mobile-owner@example.invalid');
const fixtureUser=await admin.auth.admin.getUserById(fixture.id);
assert(fixtureUser.data.user?.app_metadata.furnio_staging_fixture===true);
const before=stagingSql(`select jsonb_build_object('jobs',(select count(*) from public.jobs where user_id='${fixture.id}'),'balance',public.credit_balance('${fixture.id}'))`);
const link=await admin.auth.admin.generateLink({type:'magiclink',email:fixture.email});
assert(!link.error && link.data.properties?.hashed_token);
const signIn=await client.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});
assert(!signIn.error && signIn.data.user?.id===fixture.id && signIn.data.session);
const base='https://furnio-api-mobile-staging.amidi-alipasha.workers.dev';
const checks=[];
async function check(path,status,{auth=true,quote=true,body={}}={}) {
  const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',
    ...(auth?{Authorization:`Bearer ${signIn.data.session.access_token}`} : {}),
    ...(quote?{'X-Furnio-Expected-Credits':'5'}:{}),},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
  const data=await r.json();
  assert.equal(r.status,status,`${path} status ${r.status}: ${data.error ?? 'details withheld'}`);
  checks.push({path,status});
}
try {
  for(const suffix of ['stage','enhance','floorplan','reference-furniture','multiview','mask-edit']) {
    const path=`/api/mobile/v1/jobs/${suffix}`;
    await check(path,401,{auth:false});
    await check(path,400,{quote:false});
    await check(path,400);
  }
  await check('/api/mobile/v1/batches/reserve',400);
  await check('/api/mobile/v1/submissions/recover',400);
  await check('/api/webhooks/fal',401,{auth:false,quote:false});
  await check('/api/billing/checkout',503);
  await check('/api/jobs/stage',503);
  const after=stagingSql(`select jsonb_build_object('jobs',(select count(*) from public.jobs where user_id='${fixture.id}'),'balance',public.credit_balance('${fixture.id}'))`);
  assert.equal(after,before,'Preflight unexpectedly changed jobs or balance');
  writeFileSync(`${root}/output/staging-processing-preflight.json`,JSON.stringify({at:new Date().toISOString(),checks,jobAndBalanceUnchanged:true},null,2));
  console.log(`PASS: ${checks.length} hosted checks; authentication, credit quotes, all service input validation, unsigned webhook rejection and blocked billing. No jobs created or credits consumed.`);
} finally {await client.auth.signOut({scope:'local'});}
