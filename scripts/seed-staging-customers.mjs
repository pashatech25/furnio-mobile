// Synthetic fixtures only. Admin user creation sends no email/SMS. This is NOT
// acceptance of real signup/phone verification; those remain separate gates.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { root, stagingRef, stagingSql } from "./staging-db.mjs";

assert.deepEqual(process.argv.slice(2), ["--synthetic-staging-only"]);
const keys = parseEnv(
  readFileSync(resolve(root, ".env.staging-api.local"), "utf8"),
);
assert.equal(keys.SUPABASE_PROJECT_REF, stagingRef);
assert.equal(keys.SUPABASE_URL, `https://${stagingRef}.supabase.co`);
const client = createClient(keys.SUPABASE_URL, keys.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fixturePath = resolve(root, "output/staging-customers.json");
const labels = ["owner", "other", "pending-phone"];
let fixtures;
if (existsSync(fixturePath)) {
  assert.equal(statSync(fixturePath).mode & 0o777, 0o600);
  fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.equal(fixtures.projectRef, stagingRef);
} else {
  fixtures = {
    projectRef: stagingRef,
    customers: labels.map((label) => ({
      label,
      email: `mobile-${label}@example.invalid`,
      password: randomBytes(30).toString("base64url"),
      id: null,
    })),
  };
  writeFileSync(fixturePath, JSON.stringify(fixtures), {
    mode: 0o600,
    flag: "wx",
  });
}
assert.deepEqual(
  fixtures.customers.map((c) => c.label),
  labels,
);
const existing = await client.auth.admin.listUsers({ page: 1, perPage: 100 });
assert(!existing.error, "Staging Auth inventory failed.");
for (const fixture of fixtures.customers) {
  assert.equal(fixture.email, `mobile-${fixture.label}@example.invalid`);
  let user = existing.data.users.find((u) => u.email === fixture.email);
  if (!user) {
    const created = await client.auth.admin.createUser({
      email: fixture.email,
      password: fixture.password,
      email_confirm: true,
      app_metadata: { furnio_staging_fixture: true },
      user_metadata: { full_name: `Staging ${fixture.label}` },
    });
    assert(
      !created.error,
      `Synthetic Auth creation failed (${created.error?.status ?? "unknown"}); no response body logged.`,
    );
    user = created.data.user;
  }
  assert.equal(user.app_metadata.furnio_staging_fixture, true);
  assert(/^[a-f0-9-]{36}$/.test(user.id));
  if (fixture.id) assert.equal(user.id, fixture.id);
  fixture.id = user.id;
  writeFileSync(fixturePath, JSON.stringify(fixtures), { mode: 0o600 });
}
const ids = fixtures.customers
  .filter((c) => c.label !== "pending-phone")
  .map((c) => `'${c.id}'`)
  .join(",");
// Only two named synthetic accounts are exempted for browsing/ownership tests.
// Default signup, global SMS policy and the third fixture retain verification.
console.log(
  stagingSql(`begin;
  update public.profiles p set phone_verification_required=false where p.id in (${ids})
    and exists(select 1 from auth.users u where u.id=p.id and u.raw_app_meta_data->>'furnio_staging_fixture'='true');
  insert into public.credit_ledger(user_id,delta,reason,idempotency_key,metadata)
    select p.id,20,'manual_adjust','staging-fixture-credit:'||p.id::text,'{"synthetic_staging_fixture":true}'::jsonb
    from public.profiles p where p.id in (${ids}) and not exists(select 1 from public.credit_ledger l where l.idempotency_key='staging-fixture-credit:'||p.id::text);
  select json_build_object('synthetic_customers',(select count(*) from auth.users where raw_app_meta_data->>'furnio_staging_fixture'='true'),
    'phone_required',(select count(*) from public.profiles where phone_verification_required),
    'store_transactions',(select count(*) from public.native_transactions));
  commit;`),
);
console.log(
  "Three synthetic customers ready. Passwords are ignored/mode0600, not displayed. No real SMS/email or native purchase verified.",
);
