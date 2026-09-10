import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const main = resolve(root, '../AI Virtual Staging');
const name = `furnio-mobile-ledger-${randomUUID()}`;
const owner = 'furnio-mobile-isolated-ledger-test';
function docker(args, input) {
  return execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 60_000 });
}
const sql = (input) => docker(['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'], input);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function concurrentSql(input) {
  return new Promise((done) => {
    const child = spawn('docker',['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At']);
    let output = '', error = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { error += data; });
    child.on('error', err => done({code: -1, output, error: err.message}));
    child.on('close', code => done({code, output, error}));
    child.stdin.end(input);
  });
}
const existing = readFileSync(resolve(main, 'supabase/migrations/20260828195452_billing_versioning_and_rollover_accounting.sql'), 'utf8');
function originalFunction(name, source = existing) {
  const escaped = name.replaceAll('.', '\\.');
  const definition = source.match(new RegExp(`create or replace function ${escaped}\\([\\s\\S]*?\\n\\$\\$;`));
  assert.ok(definition, `Existing function ${name} must be present`);
  return definition[0];
}
const originalTrigger = originalFunction('private.track_subscription_credit_ledger');
console.log('Using original Stripe trigger SHA256:', createHash('sha256').update(originalTrigger).digest('hex'));
let started = false;
try {
  // No host port, no network, no external volumes, no existing database access.
  docker(['run','--detach','--rm','--name',name,'--label',`furnio.test.owner=${owner}`,
    '--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine']);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    // The image's temporary initialization server has a socket but no TCP
    // listener. Wait for the final server, not that short-lived bootstrap one.
    try { docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']); ready = true; break; } catch { await sleep(250); }
  }
  assert.ok(ready, 'Isolated PostgreSQL startup');
  sql(readFileSync(resolve(root,'backend/tests/ledger-fixture.sql'),'utf8'));
  sql(readFileSync(resolve(main,'supabase/migrations/20260829005400_fix_api_webhook_event_id_ambiguity.sql'),'utf8'));
  sql('create trigger jobs_enqueue_api_webhook after update of status on public.jobs for each row execute function private.enqueue_api_job_webhook();');
  sql(originalTrigger + '\ncreate trigger credit_ledger_track_subscription_balance before insert on public.credit_ledger for each row execute function private.track_subscription_credit_ledger();');
  sql(originalFunction('public.expire_subscription_credits'));
  sql(originalFunction('public.apply_subscription_invoice_credit'));
  sql(originalFunction('private.resolve_project_photo_limit'));
  sql(originalFunction('public.convert_trial_on_payment', readFileSync(resolve(main,'supabase/migrations/20260829162248_free_trial_phone_verification_watermark.sql'),'utf8')));
  const adminViewSource = readFileSync(resolve(main,'supabase/migrations/20260901133235_developer_billing_catalog.sql'),'utf8');
  const adminView = adminViewSource.match(/create or replace view public\.admin_customer_summary[\s\S]*?;/)?.[0];
  assert.ok(adminView, 'Original Admin customer view is present');
  sql(adminView);
  // Each migration has its own committed connection: enum values cannot be used
  // until their preceding migration commits.
  for (const file of ['20260909042902_native_credit_reasons.sql','20260909042919_native_commerce_foundation.sql','20260909044746_native_commerce_events.sql','20260909050004_native_billing_read.sql','20260909051332_mobile_activity_read.sql','20260909053256_native_customer_compatibility.sql','20260909054645_native_admin_visibility.sql','20260909063152_native_purchase_recovery.sql','20260909065713_native_purchase_intents.sql','20260909072646_native_checkout_support.sql','20260909074924_mobile_push_notifications.sql','20260909081654_mobile_account_deletion_review.sql']) {
    sql(readFileSync(resolve(main,'supabase/migrations',file),'utf8'));
  }
  sql(readFileSync(resolve(main,'supabase/migrations/20260909083857_mobile_account_deletion_requests.sql'),'utf8'));
  sql(readFileSync(resolve(main,'supabase/migrations/20260909085813_mobile_account_cleanup_fence.sql'),'utf8'));
  sql(readFileSync(resolve(main,'supabase/migrations/20260909100816_mobile_account_auth_block.sql'),'utf8'));
  sql(readFileSync(resolve(main,'supabase/migrations/20260909102539_native_stripe_checkout_recovery.sql'),'utf8'));
  sql(readFileSync(resolve(main,'supabase/migrations/20260909113159_native_refund_reversal_reason.sql'),'utf8'));
  sql(readFileSync(resolve(main,'supabase/migrations/20260909113200_native_refund_reversal_recovery.sql'),'utf8'));
  sql(readFileSync(resolve(main,'supabase/migrations/20260909121424_native_sdk_cancellation_recovery.sql'),'utf8'));
  sql(readFileSync(resolve(main,'supabase/migrations/20260909130505_native_admin_reporting.sql'),'utf8'));
  // Original table definitions, not a permissive hand-written email mock. No
  // SES/email queue connection: this suite only tests PostgreSQL boundaries.
  const emailFoundation = readFileSync(resolve(main,'supabase/migrations/20260831023826_automation_email_foundation.sql'),'utf8');
  for (const table of ['email_templates','email_template_versions','email_outbox','email_deliveries']) {
    const definition=emailFoundation.match(new RegExp(`create table public\\.${table} \\([\\s\\S]*?\\n\\);`))?.[0];
    assert.ok(definition, `Original ${table} definition is present`);
    sql(definition);
  }
  sql(readFileSync(resolve(main,'supabase/migrations/20260909150518_mobile_account_email_fence.sql'),'utf8'));
  sql(readFileSync(resolve(main,'supabase/migrations/20260909185306_native_subscription_overlap_reporting.sql'),'utf8'));
  for (const table of ['automation_flows','automation_flow_versions','automation_events','automation_runs','automation_waits','outbound_destination_allowlist']) {
    const definition=emailFoundation.match(new RegExp(`create table public\\.${table} \\([\\s\\S]*?\\n\\);`))?.[0];
    assert.ok(definition, `Original ${table} definition is present`);
    sql(definition);
  }
  const webhookFoundation=readFileSync(resolve(main,'supabase/migrations/20260901225530_add_webhook_destinations_and_fal_observability.sql'),'utf8');
  const deliveryDefinition=webhookFoundation.match(/create table public\.automation_webhook_deliveries \([\s\S]*?\n\);/)?.[0];
  assert.ok(deliveryDefinition,'Original automation delivery definition is present');
  sql(deliveryDefinition);
  // Reproduce the original private-to-browser access model. The real Worker
  // has service-role table access; do not run every assertion as table owner.
  for (const table of ['automation_flows','automation_flow_versions','automation_events','automation_runs','automation_waits','outbound_destination_allowlist','automation_webhook_deliveries']) {
    sql(`alter table public.${table} enable row level security;
      revoke all on public.${table} from public,anon,authenticated;
      grant all on public.${table} to service_role;`);
  }
  sql(readFileSync(resolve(main,'supabase/migrations/20260909193514_mobile_account_automation_fence.sql'),'utf8'));
  sql(readFileSync(resolve(main,'supabase/migrations/20260909213457_native_automation_customer_billing.sql'),'utf8'));
  const currentTrigger = sql("select pg_get_functiondef('private.track_subscription_credit_ledger()'::regprocedure)");
  assert.ok(currentTrigger.includes("elsif new.reason = 'native_refund'"), 'Native-specific Stripe compatibility branch');
  sql(readFileSync(resolve(root,'backend/tests/ledger-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/event-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/billing-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/activity-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/compatibility-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/admin-native-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/native-reporting-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/subscription-overlap-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/automation-billing-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/recovery-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/purchase-intent-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/checkout-support-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/checkout-cancellation-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/notification-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/account-deletion-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/account-request-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/account-cleanup-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/account-auth-block-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/account-email-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/account-automation-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/stripe-checkout-recovery-cases.sql'),'utf8'));
  sql(readFileSync(resolve(root,'backend/tests/refund-reversal-cases.sql'),'utf8'));
  console.log('SQL ledger, environment, ownership, rollback, refund and privilege cases passed.');
  // Each dispatcher has its own connection and races for the same outbox row.
  // No real email/queue/provider is contacted by this test.
  const emailUser='00000000-0000-4000-8000-000000000411';
  const emailId='50000000-0000-4000-8000-000000000411';
  sql(`insert into auth.users(id) values('${emailUser}');
    insert into public.profiles(id,email) values('${emailUser}','concurrent-email@example.invalid');
    insert into public.email_templates(id,slug,display_name,category,event_type) values('${emailId}','concurrent_email_fixture','Fixture','product','test');
    insert into public.email_outbox(id,event_id,event_type,user_id,normalized_recipient,template_id,template_version,category,idempotency_key)
      values('${emailId}','${emailId}','test','${emailUser}','concurrent-email@example.invalid','${emailId}',1,'product','${emailId}');`);
  const emailSnapshot=JSON.parse(sql(`select jsonb_build_object('user_id',user_id,'normalized_recipient',normalized_recipient,
    'template_id',template_id,'template_version',template_version,'payload',payload) from public.email_outbox where id='${emailId}';`));
  const emailClaims=await Promise.all([1,2].map(()=>concurrentSql(`select public.claim_mobile_account_email('${emailId}','${JSON.stringify(emailSnapshot)}'::jsonb);`)));
  assert.ok(emailClaims.every(result=>result.code===0),'Concurrent email checks complete without database errors');
  assert.equal(emailClaims.filter(result=>JSON.parse(result.output).status==='allowed').length,1,'Exactly one dispatcher receives email send permission');
  assert.equal(emailClaims.filter(result=>JSON.parse(result.output).status==='ambiguous').length,1,'Other dispatcher leaves in-flight email alone');
  assert.equal(sql(`select attempt_count from public.email_outbox where id='${emailId}';`).trim(),'1','Atomic email claim counts one attempt');
  console.log('Two-connection guarded email dispatch claim passed.');
  const reversalUser='00000000-0000-4000-8000-000000000305';
  sql(`insert into public.profiles(id) values('${reversalUser}');
    select public.record_verified_native_purchase('${reversalUser}','SANDBOX','APP_STORE','reverse305','rc-purchase:reverse305','pack20',now()-interval '1 day');`);
  const reversalStamp=Number(sql('select (extract(epoch from now())*1000)::bigint;').trim());
  sql(`select public.fixture_refund_revision('${reversalUser}','reverse305',${reversalStamp},true,'reverse305-refund');`);
  const reversals=await Promise.all([1,2].map(n=>concurrentSql(`begin;
    select public.fixture_refund_revision('${reversalUser}','reverse305',${reversalStamp+1000},false,'reverse305-duplicate-${n}');
    select pg_sleep(0.15); commit;`)));
  assert.ok(reversals.every(r=>r.code===0),`Concurrent reversals complete: ${reversals.map(r=>r.error).join(' ')}`);
  assert.equal(sql(`select public.credit_balance('${reversalUser}');`).trim(),'20','Concurrent reversal restores original grant once');
  assert.equal(sql(`select count(*) from public.credit_ledger where user_id='${reversalUser}' and reason='native_refund_reversal';`).trim(),'1');
  const refundReversalRace=await Promise.all([
    concurrentSql(`select public.fixture_refund_revision('${reversalUser}','reverse305',${reversalStamp+2000},true,'reverse305-next-refund');`),
    concurrentSql(`select public.fixture_refund_revision('${reversalUser}','reverse305',${reversalStamp+3000},false,'reverse305-next-reversal');`),
  ]);
  assert.ok(refundReversalRace.every(r=>r.code===0),`Opposite-state race: ${refundReversalRace.map(r=>r.error).join(' ')}`);
  assert.equal(sql(`select public.credit_balance('${reversalUser}');`).trim(),'20','Newest financial revision wins independent of delivery order');
  const spendRefundRace=await Promise.all([
    concurrentSql(`select public.fixture_refund_revision('${reversalUser}','reverse305',${reversalStamp+4000},true,'reverse305-final-refund');`),
    concurrentSql(`insert into public.credit_ledger(user_id,delta,reason,idempotency_key) values('${reversalUser}',-20,'job_reserve','reverse305-concurrent-spend');`),
  ]);
  assert.equal(spendRefundRace[0].code,0,'Refund always reconciles without a negative balance');
  assert.equal(sql(`select public.credit_balance('${reversalUser}');`).trim(),'0');
  assert.equal(sql(`select shortfall from public.native_reconciliation_alerts where user_id='${reversalUser}';`).trim(),spendRefundRace[1].code===0?'20':'0','Only credits actually spent become a shortfall');
  console.log('Concurrent refund/reversal, duplicate restoration and native-spend races passed.');
  const user = '00000000-0000-4000-8000-000000000019';
  sql(`insert into public.credit_ledger(user_id,delta,reason,idempotency_key) values('${user}',5,'manual_adjust','concurrency-grant');`);
  const results = await Promise.all([1,2].map(n => concurrentSql(`begin; insert into public.credit_ledger(user_id,delta,reason,idempotency_key) values('${user}',-5,'job_reserve','simultaneous-${n}'); select pg_sleep(0.15); commit;`)));
  assert.equal(results.filter(r => r.code === 0).length,1, 'Only one simultaneous spend succeeds');
  assert.equal(sql(`select public.credit_balance('${user}');`).trim(),'0');
  const purchase = (userId) => `select public.record_verified_native_purchase('${userId}','SANDBOX','APP_STORE','same-store-txn','same-store-original','pack20',now());`;
  const purchases = await Promise.all([user,'00000000-0000-4000-8000-000000000020'].map(u => concurrentSql(purchase(u))));
  assert.equal(purchases.filter(r => r.code === 0).length,1, 'A store purchase cannot race into two accounts');
  assert.equal(sql("select count(*) from public.native_transactions where store_transaction_id='same-store-txn';").trim(),'1');
  console.log('Two-connection double-spend and cross-account purchase race tests passed.');
  sql("update private.native_commerce_settings set checkout_protection_enabled=true,customer_compatibility_enabled=true,acquisition_enabled=true; insert into public.profiles(id) values('00000000-0000-4000-8000-000000000101'); insert into public.native_product_availability(product_version_id,available) select id,true from public.native_product_versions where product_id='monthly50' on conflict(product_version_id) do update set available=true;");
  const races = await Promise.all(['STRIPE','PLAY_STORE'].map((provider, index) => concurrentSql(`begin; select public.begin_customer_purchase_intent('00000000-0000-4000-8000-000000000101','SANDBOX','${provider}','${index ? 'monthly50' : '20000000-0000-4000-8000-000000000002'}','30000000-0000-4000-8000-00000000000${index+1}',repeat('a',64)); select pg_sleep(0.2); commit;`)));
  assert.equal(races.filter(r => r.code === 0 && r.output.includes('"allowed": true')).length,1,'Only one Stripe/native checkout can reserve the same account');
  assert.equal(races.filter(r => r.code === 0 && r.output.includes('"reason": "purchase_pending"')).length,1,'Losing provider gets an explicit pending result');
  const held = sql("select id||'|'||provider from private.customer_purchase_intents where user_id='00000000-0000-4000-8000-000000000101';").trim().split('|');
  const launches = await Promise.all([1,2].map(() => concurrentSql(`select public.launch_customer_purchase_intent('00000000-0000-4000-8000-000000000101','SANDBOX','${held[0]}','${held[1]}');`)));
  assert.equal(launches.filter(r => r.code === 0 && r.output.trim()==='t').length,1,'Only one concurrent launch may open a store sheet');
  console.log('Cross-provider acquisition and duplicate-launch races passed.');
  const cancelUser = '00000000-0000-4000-8000-000000000102';
  const cancelRequest = '30000000-0000-4000-8000-000000000009';
  sql(`insert into public.profiles(id) values('${cancelUser}'); insert into public.native_product_availability(product_version_id,available) select id,true from public.native_product_versions where product_id='pack20' on conflict(product_version_id) do update set available=true;`);
  const cancelIntent = JSON.parse(sql(`select public.begin_customer_purchase_intent('${cancelUser}','SANDBOX','APP_STORE','pack20','${cancelRequest}',repeat('a',64));`)).intentId;
  const cancellationRace = await Promise.all([
    concurrentSql(`select public.launch_customer_purchase_intent('${cancelUser}','SANDBOX','${cancelIntent}','APP_STORE');`),
    concurrentSql(`select public.recover_native_purchase_selection('${cancelUser}','SANDBOX','APP_STORE','${cancelRequest}');`),
  ]);
  assert.ok(cancellationRace.every(result => result.code === 0), 'Launch/recovery race completes without SQL errors');
  const launched = cancellationRace[0].output.trim() === 't';
  const recoveryState = JSON.parse(cancellationRace[1].output.trim()).status;
  assert.equal(recoveryState, launched ? 'pending' : 'cancelled', 'Recovery cannot cancel a simultaneously launched checkout');
  console.log('Simultaneous customer recovery/launch preserves payment protection.');
  const sdkUser='00000000-0000-4000-8000-000000000323';
  sql(`insert into public.profiles(id) values('${sdkUser}'); update private.native_commerce_settings set sdk_cancellation_recovery_enabled=true;`);
  const sdkIntent=JSON.parse(sql(`select public.begin_customer_purchase_intent('${sdkUser}','SANDBOX','APP_STORE','pack20',gen_random_uuid(),repeat('a',64));`)).intentId;
  sql(`select public.launch_customer_purchase_intent('${sdkUser}','SANDBOX','${sdkIntent}','APP_STORE');`);
  const sdkClaims=await Promise.all([1,2].map(()=>concurrentSql(`select public.claim_native_checkout_cancellation('${sdkUser}','SANDBOX','${sdkIntent}');`)));
  assert.ok(sdkClaims.every(result=>result.code===0),'Concurrent cancellation claims complete safely');
  assert.equal(sdkClaims.filter(result=>result.output.includes('leaseId')).length,1,'One provider verification lease per cancelled checkout');
  const sdkLease=JSON.parse(sdkClaims.find(result=>result.output.includes('leaseId')).output).leaseId;
  const sdkFinishes=await Promise.all([1,2].map(()=>concurrentSql(`select public.finish_native_checkout_cancellation('${sdkUser}','SANDBOX','${sdkIntent}','${sdkLease}','clear_snapshot');`)));
  assert.ok(sdkFinishes.every(result=>result.code===0),'Duplicate cancellation results complete safely');
  assert.equal(sdkFinishes.filter(result=>result.output.trim()==='t').length,1,'One audited selection release');
  assert.equal(sql(`select public.credit_balance('${sdkUser}');`).trim(),'0','Cancellation does not grant credits');
  console.log('Concurrent SDK cancellation claims and acknowledgements passed.');
  const deletionUser = '00000000-0000-4000-8000-000000000214';
  const deletionSession = '10000000-0000-4000-8000-000000000214';
  sql(`insert into auth.users(id) values('${deletionUser}'); insert into public.profiles(id) values('${deletionUser}');
    insert into auth.sessions(id,user_id) values('${deletionSession}','${deletionUser}');
    insert into auth.mfa_amr_claims(session_id,authentication_method,updated_at) values('${deletionSession}','password',date_trunc('second',now()));
    update private.mobile_account_settings set environment='SANDBOX',review_enabled=true,requests_enabled=true,processor_ready=true;`);
  const deletionProof = `'${deletionUser}','${deletionSession}',(select updated_at from auth.mfa_amr_claims where session_id='${deletionSession}'),'password','aal1'`;
  const deletionRequests = ['30000000-0000-4000-8000-000000000214','30000000-0000-4000-8000-000000000215'];
  const preparations = await Promise.all(deletionRequests.map(id => concurrentSql(`begin;
    select public.manage_mobile_account_deletion_request('prepare','SANDBOX','${id}',repeat('d',64),${deletionProof}); select pg_sleep(0.1); commit;`)));
  assert.equal(preparations.filter(r=>r.code===0).length,1,'Only one simultaneous deletion review can be open');
  const openDeletion = JSON.parse(sql(`select public.manage_mobile_account_deletion_request('prepare','SANDBOX',
    (select id from private.mobile_account_deletion_requests where user_id='${deletionUser}' and state='prepared'),repeat('d',64),${deletionProof});`));
  const confirmSql = `select public.manage_mobile_account_deletion_request('confirm','SANDBOX','${openDeletion.requestId}',repeat('d',64),${deletionProof},'${openDeletion.challenge}','shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);`;
  const confirmations = await Promise.all([1,2].map(()=>concurrentSql(confirmSql)));
  assert.ok(confirmations.every(r=>r.code===0),'Duplicate confirmation completes idempotently');
  assert.equal(confirmations[0].output,confirmations[1].output,'Duplicate confirmation returns the same timestamp/receipt');
  assert.equal(sql(`select count(*) from private.mobile_account_deletion_requests where user_id='${deletionUser}' and state='queued';`).trim(),'1','Exactly one durable cleanup intent');
  console.log('Concurrent deletion preparation and confirmation races passed.');
  // Real two-connection fence tests in this run's disposable fixture only.
  sql('update private.mobile_account_settings set cleanup_enabled=true;');
  async function waitForPause(application) {
    for (let attempt=0; attempt<30; attempt++) {
      if (sql(`select count(*) from pg_stat_activity where application_name='${application}' and wait_event='PgSleep';`).trim()==='1') return;
      await sleep(20);
    }
    assert.fail(`Fixture statement ${application} did not reach its lock-holding pause`);
  }
  const racingJob='50000000-0000-4000-8000-000000000214';
  const admitted = concurrentSql(`begin; set local application_name='furnio-cleanup-writer';
    insert into public.jobs(id,user_id,type,status) values('${racingJob}','${deletionUser}','staging','queued'); select pg_sleep(1); commit;`);
  await waitForPause('furnio-cleanup-writer');
  const fencing = concurrentSql("select public.claim_mobile_account_media_cleanup('SANDBOX');");
  const admittedRace=await Promise.all([admitted,fencing]);
  assert.ok(admittedRace.every(r=>r.code===0), `Already admitted work must drain into the fence: ${admittedRace.map(r=>r.error).join(' ')}`);
  assert.equal(sql(`select status from public.jobs where id='${racingJob}';`).trim(),'cancelled','Pre-fence committed work is terminalized');
  assert.equal(sql(`select count(*) from private.mobile_account_media_scopes where job_id='${racingJob}' and user_id='${deletionUser}';`).trim(),'1','Pre-fence work enters owned temporary-media inventory');

  const fencedUser='00000000-0000-4000-8000-000000000215';
  const fencedSession='10000000-0000-4000-8000-000000000215';
  const fencedRequest='30000000-0000-4000-8000-000000000216';
  sql(`insert into auth.users(id) values('${fencedUser}'); insert into public.profiles(id) values('${fencedUser}');
    insert into auth.sessions(id,user_id) values('${fencedSession}','${fencedUser}');
    insert into auth.mfa_amr_claims(session_id,authentication_method,updated_at) values('${fencedSession}','password',date_trunc('second',now()));`);
  const fencedProof=`'${fencedUser}','${fencedSession}',(select updated_at from auth.mfa_amr_claims where session_id='${fencedSession}'),'password','aal1'`;
  const preparedFence=JSON.parse(sql(`select public.manage_mobile_account_deletion_request('prepare','SANDBOX','${fencedRequest}',repeat('c',64),${fencedProof});`));
  sql(`select public.manage_mobile_account_deletion_request('confirm','SANDBOX','${fencedRequest}',repeat('c',64),${fencedProof},'${preparedFence.challenge}','shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);`);
  const fenceFirst=concurrentSql(`begin; set local application_name='furnio-cleanup-fence';
    select public.claim_mobile_account_media_cleanup('SANDBOX'); select pg_sleep(1); commit;`);
  await waitForPause('furnio-cleanup-fence');
  const rejectedLate=concurrentSql(`insert into public.jobs(id,user_id,type,status) values('${fencedRequest}','${fencedUser}','staging','queued');`);
  const rejectedPromotion=concurrentSql(`insert into public.admin_users(user_id,role) values('${fencedUser}','admin');`);
  const fenceRace=await Promise.all([fenceFirst,rejectedLate,rejectedPromotion]);
  assert.equal(fenceRace[0].code,0,`Fence commits: ${fenceRace[0].error}`);
  assert.notEqual(fenceRace[1].code,0,'A write waiting behind the fence is denied');
  assert.match(fenceRace[1].error,/Account deletion prevents new customer work/);
  assert.equal(sql(`select count(*) from public.jobs where id='${fencedRequest}';`).trim(),'0','Denied late job does not persist');
  assert.notEqual(fenceRace[2].code,0,'Administrator promotion waiting behind a fence is denied');
  assert.match(fenceRace[2].error,/Deleting account cannot receive administrator access/);
  console.log('Two-connection account fence races passed: admitted work inventoried; late work rejected.');
  const snapshotUser='00000000-0000-4000-8000-000000000216';
  const snapshotSession='10000000-0000-4000-8000-000000000216';
  const snapshotRequest='30000000-0000-4000-8000-000000000217';
  sql(`insert into auth.users(id) values('${snapshotUser}'); insert into public.profiles(id) values('${snapshotUser}');
    insert into auth.sessions(id,user_id) values('${snapshotSession}','${snapshotUser}');
    insert into auth.mfa_amr_claims(session_id,authentication_method,updated_at) values('${snapshotSession}','password',date_trunc('second',now()));`);
  const snapshotProof=`'${snapshotUser}','${snapshotSession}',(select updated_at from auth.mfa_amr_claims where session_id='${snapshotSession}'),'password','aal1'`;
  const snapshotReview=JSON.parse(sql(`select public.manage_mobile_account_deletion_request('prepare','SANDBOX','${snapshotRequest}',repeat('e',64),${snapshotProof});`));
  sql(`select public.manage_mobile_account_deletion_request('confirm','SANDBOX','${snapshotRequest}',repeat('e',64),${snapshotProof},'${snapshotReview.challenge}','shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);`);
  const staleWriter=concurrentSql(`begin isolation level repeatable read; set local application_name='furnio-cleanup-snapshot';
    select account_status from public.profiles where id='${snapshotUser}'; select pg_sleep(1);
    insert into public.jobs(id,user_id,type,status) values('${snapshotRequest}','${snapshotUser}','staging','queued'); commit;`);
  await waitForPause('furnio-cleanup-snapshot');
  sql("select public.claim_mobile_account_media_cleanup('SANDBOX');");
  const staleResult=await staleWriter;
  assert.notEqual(staleResult.code,0,'A pre-fence repeatable-read snapshot must not admit post-fence work');
  assert.equal(sql(`select count(*) from public.jobs where id='${snapshotRequest}';`).trim(),'0','No work persists under a stale transaction snapshot');
  console.log('Repeatable-read snapshot cannot bypass a committed account fence.');
  sql(`update private.mobile_account_settings set auth_block_enabled=true;
    update private.mobile_account_cleanup set auth_block_next_attempt_at=now()+interval '1 day';
    update private.mobile_account_cleanup set auth_block_next_attempt_at=now() where user_id='${deletionUser}';`);
  const authClaims=await Promise.all([1,2].map(()=>concurrentSql(`begin;
    select public.claim_mobile_account_auth_block('SANDBOX'); select pg_sleep(0.15); commit;`)));
  assert.ok(authClaims.every(result=>result.code===0),'Simultaneous Auth claims do not fail');
  assert.equal(authClaims.filter(result=>result.output.includes('"block_sign_in"')).length,1,'Only one cron lease owns the same Auth target');
  const authTarget=JSON.parse(sql(`select jsonb_build_object('request',request_id,'lease',auth_block_lease_id)
    from private.mobile_account_cleanup where user_id='${deletionUser}';`));
  sql(`update auth.users set banned_until=now()+interval '100 years' where id='${deletionUser}';`);
  const authAcks=await Promise.all([1,2].map(()=>concurrentSql(`select public.finish_mobile_account_auth_block
    ('SANDBOX','${authTarget.request}','${authTarget.lease}','blocked');`)));
  assert.ok(authAcks.every(result=>result.code===0),'Duplicate Auth acknowledgements finish safely');
  assert.equal(authAcks.filter(result=>result.output.trim()==='t').length,1,'One durable observation per Auth lease');
  assert.equal(sql(`select state from private.mobile_account_deletion_requests where id='${authTarget.request}';`).trim(),'queued','Auth block cannot report deletion complete');
  console.log('Concurrent Auth claims/acknowledgements and administrator-promotion fence passed.');
  for (const [index, ordering] of ['writer-first','fence-first'].entries()) {
    const suffix=String(431+index);
    const u=`00000000-0000-4000-8000-000000000${suffix}`;
    const session=`10000000-0000-4000-8000-000000000${suffix}`;
    const request=`30000000-0000-4000-8000-000000000${suffix}`;
    const flow=`40000000-0000-4000-8000-000000000${suffix}`;
    const run=`60000000-0000-4000-8000-000000000${suffix}`;
    const existingRun=`70000000-0000-4000-8000-000000000${suffix}`;
    sql(`insert into auth.users(id) values('${u}'); insert into public.profiles(id) values('${u}');
      insert into auth.sessions(id,user_id) values('${session}','${u}');
      insert into auth.mfa_amr_claims(session_id,authentication_method,updated_at) values('${session}','password',date_trunc('second',now()));
      insert into public.automation_flows(id,name) values('${flow}','Isolated automation race');
      insert into public.automation_runs(id,flow_id,flow_version,context) values('${existingRun}','${flow}',1,jsonb_build_object('customer_id','${u}'::text));`);
    const proof=`'${u}','${session}',(select updated_at from auth.mfa_amr_claims where session_id='${session}'),'password','aal1'`;
    const review=JSON.parse(sql(`select public.manage_mobile_account_deletion_request('prepare','SANDBOX','${request}',repeat('a',64),${proof});`));
    sql(`select public.manage_mobile_account_deletion_request('confirm','SANDBOX','${request}',repeat('a',64),${proof},'${review.challenge}','shared-account-v1','DELETE MY FURNIO ACCOUNT',true,true);`);
    const insert=`insert into public.automation_runs(id,flow_id,flow_version,context) values('${run}','${flow}',1,jsonb_build_object('customer_id','${u}'::text));`;
    const fence=`select private.begin_mobile_account_cleanup('${request}','SANDBOX');`;
    const snapshot=sql(`select jsonb_build_object('context',context,'current_node_id',current_node_id,'flow_id',flow_id,'flow_version',flow_version,'is_test',is_test) from public.automation_runs where id='${existingRun}';`).trim();
    const first=concurrentSql(`begin; set local application_name='furnio-automation-${ordering}'; ${index===0?insert:fence} select pg_sleep(1); commit;`);
    await waitForPause(`furnio-automation-${ordering}`);
    const later=concurrentSql(index===0?fence:insert);
    const guarded=index===1?concurrentSql(`select public.check_mobile_automation_work('run','${existingRun}','${snapshot}'::jsonb);`):null;
    const race=await Promise.all([first,later]);
    assert.ok(race.every(result=>result.code===0),`${ordering} automation race: ${race.map(result=>result.error).join(' ')}`);
    assert.equal(sql(`select status from public.automation_runs where id='${run}';`).trim(),'cancelled',`${ordering}: late/early queued row suppressed`);
    if (guarded) {
      const result=await guarded;
      assert.equal(result.code,0,result.error);
      assert.equal(JSON.parse(result.output).status,'blocked','Guard reloads account state after waiting for fence');
    }
  }
  console.log('Automation writer-first/fence-first races and loaded-snapshot rejection passed.');
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  if (started) {
    const label = docker(['inspect','--format','{{index .Config.Labels "furnio.test.owner"}}',name]).trim();
    assert.equal(label,owner, 'Only stop the container created by this test run');
    docker(['stop','--time','1',name]);
    console.log('Removed this run’s temporary fixture container; other databases untouched.');
  }
}
