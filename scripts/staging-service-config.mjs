// Configuration-only snapshot. Production is accessed through Supabase's
// dedicated read-only endpoint; only stagingSql can perform writes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stagingSql, root } from './staging-db.mjs';
const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert(['--inspect', '--apply-staging', '--verify'].includes(mode));
const credential = spawnSync('/usr/bin/security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'], {encoding: 'utf8'});
assert.equal(credential.status, 0);
let token = credential.stdout.trim();
if (token.startsWith('go-keyring-base64:')) token = Buffer.from(token.slice(18), 'base64').toString();
assert(/^sbp_(oauth_)?[a-f0-9]{40}$/.test(token));
const columns = {
  model_registry: 'id,provider,endpoint,operation,display_name,enabled,is_default,fallback_model_id,allowed_room_types,input_schema,default_parameters,cost_metadata',
  feature_registry: 'id,slug,display_name,description,enabled,sort_order,model_id,fallback_model_id,credits_per_output,settings',
  ai_prompt_presets: 'id,feature,preset_key,label,description,prompt_template,metadata,sort_order,is_active',
  runtime_settings: 'id,image_pipeline,topaz,disclosure',
  trial_policies: 'id,enabled,successful_output_limit,attempt_limit,duration_days,unlock_credits,allowed_service_slugs,watermark_settings,otp_settings',
};
const snapshot = {};
for (const [table, fields] of Object.entries(columns)) {
  const query = `select ${fields} from public.${table} order by id`;
  const response = await fetch('https://api.supabase.com/v1/projects/sgsjkgfwgxmlqcgyuyeh/database/query/read-only', {
    method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({query}), redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  assert(response.ok, `Read-only ${table} snapshot failed (${response.status}); details withheld`);
  snapshot[table] = await response.json();
  assert(Array.isArray(snapshot[table]));
}
const text = JSON.stringify(snapshot);
assert(!/sb_secret_|sbp_|sk_live_|AKIA|GOCSPX/.test(text), 'Unexpected credential in configuration');
assert.equal(spawnSync('git', ['check-ignore', '-q', 'output/production-service-config.json'], {cwd: root}).status, 0);
writeFileSync(`${root}/output/production-service-config.json`, text, {mode: 0o600});
console.log(JSON.stringify({tables: Object.fromEntries(Object.entries(snapshot).map(([k,v])=>[k,v.length])),
  sha256: createHash('sha256').update(text).digest('hex'),
  services: snapshot.feature_registry.map(f=>({slug:f.slug,enabled:f.enabled,credits:f.credits_per_output,model:snapshot.model_registry.find(m=>m.id===f.model_id)?.endpoint})),
  models: snapshot.model_registry.filter(m=>m.enabled).map(m=>({endpoint:m.endpoint,parameters:m.default_parameters,cost:m.cost_metadata})),
  pipeline: snapshot.runtime_settings,
  trial: snapshot.trial_policies.map(({enabled,successful_output_limit,allowed_service_slugs})=>({enabled,successful_output_limit,allowed_service_slugs})),
}));
if (mode !== '--inspect') {
 if (mode === '--apply-staging') {
  const before = Object.fromEntries(Object.entries(columns).map(([table,fields]) =>
    [table, JSON.parse(stagingSql(`select coalesce(jsonb_agg(r), '[]') from (select ${fields} from public.${table} order by id) r`))]));
  writeFileSync(`${root}/output/staging-service-config-before-${Date.now()}.json`, JSON.stringify(before), {mode:0o600});
  const literal = (data) => `'${JSON.stringify(data).replaceAll("'", "''")}'::jsonb`;
  const statements = ['begin;'];
  for (const table of Object.keys(columns)) statements.push(`create temp table incoming_${table} on commit drop as select * from jsonb_populate_recordset(null::public.${table}, ${literal(snapshot[table])});`);
  // Preserve staging IDs and every job FK. Translate source model IDs using
  // (provider, endpoint); never copy users, assets, billing records or secrets.
  statements.push('update public.model_registry set is_default=false;');
  const modelFields = columns.model_registry.split(',').filter(c=>!['id','fallback_model_id'].includes(c));
  statements.push(`insert into public.model_registry (${modelFields}) select ${modelFields} from incoming_model_registry on conflict (provider,endpoint) do update set ${modelFields.filter(c=>!['provider','endpoint'].includes(c)).map(c=>`${c}=excluded.${c}`).join(',')};`);
  statements.push(`update public.model_registry m set fallback_model_id=(select f.id from incoming_model_registry source_f join public.model_registry f on f.provider=source_f.provider and f.endpoint=source_f.endpoint where source_f.id=s.fallback_model_id) from incoming_model_registry s where m.provider=s.provider and m.endpoint=s.endpoint;`);
  const modelRef = (field) => `(select m.id from incoming_model_registry p join public.model_registry m on m.provider=p.provider and m.endpoint=p.endpoint where p.id=s.${field})`;
  const featureFields = columns.feature_registry.split(',').filter(c=>c!=='id');
  statements.push(`insert into public.feature_registry (${featureFields}) select ${featureFields.map(c=>['model_id','fallback_model_id'].includes(c)?modelRef(c):`s.${c}`).join(',')} from incoming_feature_registry s on conflict (slug) do update set ${featureFields.filter(c=>c!=='slug').map(c=>`${c}=excluded.${c}`).join(',')};`);
  for (const table of ['ai_prompt_presets', 'runtime_settings', 'trial_policies']) {
    const fields = columns[table].split(',').filter(c=>table!=='ai_prompt_presets'||c!=='id');
    const conflict = table!=='ai_prompt_presets'?['id']:['feature','preset_key'];
    statements.push(`insert into public.${table} (${fields}) select ${fields} from incoming_${table} on conflict (${conflict}) do update set ${fields.filter(c=>!conflict.includes(c)).map(c=>`${c}=excluded.${c}`).join(',')};`);
  }
  statements.push(`update public.feature_registry f set enabled=false where not exists (select 1 from incoming_feature_registry s where s.slug=f.slug);`);
  statements.push(`update public.ai_prompt_presets p set is_active=false where not exists (select 1 from incoming_ai_prompt_presets s where s.feature=p.feature and s.preset_key=p.preset_key);`);
  statements.push('commit;');
  stagingSql(statements.join('\n'));
 }
  const after = Object.fromEntries(Object.entries(columns).map(([table,fields]) =>
    [table, JSON.parse(stagingSql(`select coalesce(jsonb_agg(r), '[]') from (select ${fields} from public.${table} order by id) r`))]));
  function comparable(data, table) {
    const modelName = id => {if(!id) return null; const m=data.model_registry.find(m=>m.id===id); assert(m); return `${m.provider}:${m.endpoint}`;};
    return data[table].map(row=>Object.fromEntries(Object.entries(row).filter(([k])=>k!=='id').map(([k,v])=>[k,['model_id','fallback_model_id'].includes(k)?modelName(v):v])))
      .sort((a,b)=>String(a.endpoint ?? a.slug ?? `${a.feature}:${a.preset_key}`).localeCompare(String(b.endpoint ?? b.slug ?? `${b.feature}:${b.preset_key}`)));
  }
  for (const table of Object.keys(columns)) assert.deepEqual(comparable(after,table), comparable(snapshot,table), `${table} parity verification failed`);
  console.log('Verified staging parity: 9 enabled services, exact Admin models, prompts, image pipeline and trial policy. Production read-only; staging account/job/media records preserved.');
}
