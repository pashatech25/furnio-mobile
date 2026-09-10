// Explicit, repeatable deployment of the initial read/property-create milestone.
// Cannot target production, accept extra flags, or upload live provider secrets.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import ts from "typescript";
import { root, stagingRef } from "./staging-db.mjs";

const [target, action] = process.argv.slice(2);
assert(["platform", "mobile"].includes(target));
assert(["--dry-run", "--deploy-staging"].includes(action));
assert.equal(process.argv.length, 4);
const platform = target === "platform";
const configPath = platform
  ? resolve(
      root,
      "../AI Virtual Staging/apps/api/wrangler.mobile-staging.jsonc",
    )
  : resolve(root, "backend/wrangler.staging-readonly.jsonc");
const parsed = ts.parseConfigFileTextToJson(
  configPath,
  readFileSync(configPath, "utf8"),
);
assert(!parsed.error);
const config = parsed.config;
const name = platform ? "furnio-api-mobile-staging" : "furnio-mobile-staging";
assert.equal(config.name, name);
assert.equal(config.account_id, "414fde01446debc02bbdd49e29e3a875");
assert.equal(config.main, platform ? "src/staging.ts" : "src/index.ts");
assert.deepEqual(config.routes, []);
for (const binding of [
  "env",
  "triggers",
  "queues",
  "r2_buckets",
  "durable_objects",
  "images",
  "assets",
])
  assert.equal(config[binding], undefined, `Unreviewed staging ${binding}`);
assert.equal(config.vars.SUPABASE_URL, `https://${stagingRef}.supabase.co`);
for (const [key, value] of Object.entries(config.vars)) {
  if (
    key.endsWith("_ENABLED") &&
    ![
      "MOBILE_ENABLED",
      "MOBILE_BILLING_READ_ENABLED",
      "MOBILE_ACTIVITY_READ_ENABLED",
    ].includes(key)
  )
    assert.equal(value, "false", `Unreviewed enabled gate: ${key}`);
}
assert.deepEqual(config.secrets.required, [
  platform ? "SUPABASE_SECRET_KEY" : "SUPABASE_SERVICE_ROLE_KEY",
]);
if (platform)
  assert.deepEqual(config.kv_namespaces, [
    { binding: "KV", id: "b395fa3c822f41269c1c5f8cd472449c" },
  ]);
else
  assert.deepEqual(config.services, [
    { binding: "PLATFORM", service: "furnio-api-mobile-staging" },
  ]);
const keys = parseEnv(
  readFileSync(resolve(root, ".env.staging-api.local"), "utf8"),
);
assert.equal(keys.SUPABASE_PROJECT_REF, stagingRef);
assert(
  /^sb_secret_[A-Za-z0-9_-]+$/.test(keys.SUPABASE_SECRET_KEY),
  "Refuse masked or malformed keys.",
);
assert.equal(
  readFileSync(
    resolve(root, "../AI Virtual Staging/supabase/.temp/project-ref"),
    "utf8",
  ).trim(),
  "sgsjkgfwgxmlqcgyuyeh",
);
const temporary = mkdtempSync(resolve(tmpdir(), "furnio-staging-deploy-"));
const secretsFile = resolve(temporary, "secrets.json");
writeFileSync(
  secretsFile,
  JSON.stringify({ [config.secrets.required[0]]: keys.SUPABASE_SECRET_KEY }),
  { flag: "wx", mode: 0o600 },
);
try {
  // Strip ambient cloud account/token/secret overrides. Use the same verified Wrangler login.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(CLOUDFLARE_|CF_|SUPABASE_|REVENUECAT_|STRIPE_|FAL_|WRANGLER_)/.test(
          key,
        ),
    ),
  );
  const args = [
    resolve(root, "node_modules/wrangler/bin/wrangler.js"),
    "deploy",
    "--config",
    configPath,
    "--env-file",
    "/dev/null",
    "--secrets-file",
    secretsFile,
    "--outdir",
    resolve(root, `output/staging-${target}-bundle`),
  ];
  if (action === "--dry-run") args.push("--dry-run");
  else
    args.push(
      "--message",
      "Isolated mobile staging: read/property-create only; external effects disabled",
    );
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...env, CI: "true" },
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 5 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .replaceAll(keys.SUPABASE_SECRET_KEY, "[REDACTED]")
    .replaceAll(keys.SUPABASE_PUBLISHABLE_KEY, "[PUBLISHABLE]");
  writeFileSync(
    resolve(
      root,
      `output/staging-${target}-${action === "--dry-run" ? "dry-run" : "deploy"}.log`,
    ),
    output,
    { mode: 0o600 },
  );
  console.log(output);
  assert.equal(
    result.status,
    0,
    "Staging deployment did not succeed. Check recorded result before retrying.",
  );
} finally {
  unlinkSync(secretsFile);
  rmdirSync(temporary);
}
