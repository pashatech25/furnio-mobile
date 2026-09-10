// Hosted tests, never production. Sessions stay in memory; report is redacted.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { root, stagingRef, stagingSql } from "./staging-db.mjs";

assert.deepEqual(process.argv.slice(2), ["--staging-only"]);
const platform = "https://furnio-api-mobile-staging.amidi-alipasha.workers.dev";
const mobile = "https://furnio-mobile-staging.amidi-alipasha.workers.dev";
const keys = parseEnv(
  readFileSync(resolve(root, ".env.staging-api.local"), "utf8"),
);
const fixtures = JSON.parse(
  readFileSync(resolve(root, "output/staging-customers.json"), "utf8"),
);
assert.equal(keys.SUPABASE_PROJECT_REF, stagingRef);
assert.equal(fixtures.projectRef, stagingRef);
const passes = [];
function pass(label) {
  passes.push(label);
  console.log(`PASS: ${label}`);
}
async function call(base, path, expected, token, body, headers = {}) {
  assert([platform, mobile].includes(base));
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    expected,
    `Staging ${path} HTTP status mismatch (response body withheld)`,
  );
  return result;
}

const sessions = {};
try {
  for (const fixture of fixtures.customers) {
    const client = createClient(
      `https://${stagingRef}.supabase.co`,
      keys.SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const signed = await client.auth.signInWithPassword({
      email: fixture.email,
      password: fixture.password,
    });
    assert(
      !signed.error,
      `Synthetic ${fixture.label} password sign-in failed (${signed.error?.status ?? "unknown"}).`,
    );
    assert.equal(signed.data.user.id, fixture.id);
    sessions[fixture.label] = {
      client,
      token: signed.data.session.access_token,
      id: fixture.id,
    };
  }
  pass("Hosted password sign-in for three synthetic accounts");
  const owner = sessions.owner,
    other = sessions.other,
    pending = sessions["pending-phone"];
  assert.equal((await call(platform, "/health", 200)).status, "ok");
  assert.equal((await call(mobile, "/health", 200)).environment, "staging");
  pass("Both deployed staging Workers are healthy");
  const runtime = await call(platform, "/api/public-config", 200);
  assert(runtime.features.length > 0 && runtime.branding && runtime.runtime);
  pass(
    `Public configuration reads the real staging schema (${runtime.features.length} enabled services)`,
  );
  await call(platform, "/api/me", 401);
  await call(platform, "/api/me", 401, "invalid-session-token-long-enough");
  assert.equal(
    (await call(platform, "/api/me", 200, owner.token)).user.userId,
    owner.id,
  );
  assert.equal(
    (await call(mobile, "/v1/session", 200, owner.token)).customerAccess,
    true,
  );
  await call(mobile, "/v1/session", 401);
  pass("Real JWT authentication and Worker-to-Worker customer authorization");
  const trial = (await call(platform, "/api/trial", 200, pending.token)).trial;
  assert(trial.phoneRequired && !trial.phoneVerified);
  const blocked = await call(platform, "/api/projects", 403, pending.token);
  assert.equal(blocked.code, "PHONE_VERIFICATION_REQUIRED");
  pass(
    "Unverified fixture remains blocked by the existing phone-verification gate",
  );
  let projects = (await call(platform, "/api/projects", 200, owner.token))
    .projects;
  let project = projects.find((p) => p.name === "Synthetic mobile staging QA");
  if (!project)
    project = (
      await call(platform, "/api/projects", 201, owner.token, {
        name: "Synthetic mobile staging QA",
        address: "100 Test Street, Toronto, ON, Canada",
        addressLine1: "100 Test Street",
        addressLine2: "",
        countryCode: "CA",
        locality: "Toronto",
        region: "ON",
        postalCode: "M5V 1A1",
      })
    ).project;
  assert.equal(
    (await call(platform, `/api/projects/${project.id}`, 200, owner.token))
      .project.id,
    project.id,
  );
  await call(platform, `/api/projects/${project.id}`, 404, other.token);
  const others = (await call(platform, "/api/projects", 200, other.token))
    .projects;
  assert(!others.some((p) => p.id === project.id));
  const direct = await other.client
    .from("projects")
    .select("id")
    .eq("id", project.id);
  assert(!direct.error && direct.data.length === 0);
  pass(
    "Real project creation/list/detail and cross-account API + direct RLS isolation",
  );
  await call(platform, "/api/billing", 401);
  await call(
    platform,
    "/api/billing",
    401,
    "invalid-session-token-long-enough",
  );
  await call(platform, "/api/billing", 403, pending.token);
  for (const session of [owner, other]) {
    const account = await call(platform, "/api/billing", 200, session.token);
    assert.equal(account.balance, 20);
    assert.equal(account.subscription, null);
    // The website reader shows purchases/grants, not the synthetic admin credit.
    assert.deepEqual(account.recentTransactions, []);
    assert.equal(account.nativeBilling, undefined);
    assert.equal(account.checkoutRecoveryEnabled, undefined);
    const attemptedSelector = await call(
      platform,
      `/api/billing?user_id=${pending.id}`,
      200,
      session.token,
    );
    assert.deepEqual(attemptedSelector, account);
  }
  pass(
    "Existing website wallet reads with verified-account auth, no native payment dependency or client identity selector",
  );
  const capabilities = await call(mobile, "/v1/capabilities", 200);
  assert(capabilities.billingReady && capabilities.activityReady);
  assert(
    !capabilities.commerceReady &&
      !capabilities.accountDeletionReady &&
      !capabilities.notificationsReady &&
      !capabilities.recoveryReady,
  );
  for (const store of ["APP_STORE", "PLAY_STORE"]) {
    const billing = await call(
      mobile,
      `/v1/billing?store=${store}`,
      200,
      owner.token,
    );
    assert.equal(billing.balance, 20);
    assert.equal(billing.acquisitionEnabled, false);
    assert.equal(billing.transactions.length, 1);
    assert.equal(billing.transactions[0].provider, "admin");
    assert.equal(billing.products.length, 0);
    assert.equal(billing.subscriptions.length, 0);
  }
  assert.equal(
    (await call(mobile, "/v1/activity", 200, owner.token)).items.length,
    0,
  );
  pass(
    "Both store billing readers and activity work without inventing products/purchases",
  );
  for (const path of [
    "/api/mobile/v1/jobs/stage",
    "/api/jobs/enhance",
    "/api/uploads/presign",
    "/api/billing/checkout",
    "/api/billing",
    "/api/billing/portal",
    "/api/trial/phone/start",
    "/api/email/send",
    "/api/webhooks/stripe",
  ]) {
    await call(platform, path, 503, owner.token, {});
  }
  await call(mobile, "/v1/webhooks/revenuecat", 503, undefined, {});
  await call(mobile, "/v1/purchases/reconcile", 503, owner.token, {});
  await call(platform, "/api/me", 403, owner.token, undefined, {
    Origin: "https://furnio.ai",
  });
  await call(mobile, "/v1/session", 403, owner.token, undefined, {
    Origin: "https://furnio.ai",
  });
  pass(
    "Generation, checkout, webhooks, messages and browser origins fail closed",
  );
  assert.equal(
    (await call(platform, "/api/credits/balance", 200, owner.token)).balance,
    20,
  );
  const clean = JSON.parse(
    stagingSql(
      "select json_build_object('jobs',(select count(*) from public.jobs),'transactions',(select count(*) from public.native_transactions),'users',(select count(*) from auth.users));",
    ),
  );
  assert.deepEqual(clean, { jobs: 0, transactions: 0, users: 3 });
  pass(
    "No credits spent, jobs created or purchases recorded by blocked requests",
  );
  writeFileSync(
    resolve(root, "output/staging-api-acceptance.json"),
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        projectRef: stagingRef,
        platform,
        mobile,
        passes,
        limitations: [
          "Synthetic password accounts; real signup/Google/Apple/SMS not accepted",
          "Two synthetic accounts have per-account phone exemptions for browsing tests",
          "No upload, image processing, store purchase, push or deletion acceptance",
        ],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
} finally {
  for (const session of Object.values(sessions))
    await session.client.auth.signOut({ scope: "local" });
}
