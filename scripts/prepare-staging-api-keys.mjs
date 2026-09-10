// Capture only this staging project's current keys, never production/legacy keys.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  openSync,
  writeFileSync,
  closeSync,
  fsyncSync,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { root, stagingRef } from "./staging-db.mjs";

assert.deepEqual(process.argv.slice(2), ["--staging-only"]);
const result = spawnSync(
  "/opt/homebrew/bin/supabase",
  ["projects", "api-keys", "--project-ref", stagingRef, "--output", "json"],
  { encoding: "utf8", timeout: 30_000 },
);
assert.equal(result.status, 0, "Staging key lookup failed; output withheld.");
const keys = JSON.parse(result.stdout);
const publishable = keys.find(
  (k) => k.type === "publishable" && k.name === "default",
)?.api_key;
const secretMetadata = keys.find(
  (k) => k.type === "secret" && k.name === "default",
);
assert(/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishable));
assert(/^[a-f0-9-]{36}$/.test(secretMetadata.id));
// CLI2.40.7 does not request reveal=true. Use the documented single-key endpoint
// and exactly the CLI's existing named macOS credential (never enumerate the keychain).
const credential = spawnSync(
  "/usr/bin/security",
  ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"],
  { encoding: "utf8", timeout: 30_000 },
);
assert.equal(
  credential.status,
  0,
  "Existing Supabase CLI login could not be read; no credential output logged.",
);
let token = credential.stdout.trim();
if (token.startsWith("go-keyring-base64:"))
  token = Buffer.from(
    token.slice("go-keyring-base64:".length),
    "base64",
  ).toString("utf8");
assert(/^sbp_(oauth_)?[a-f0-9]{40}$/.test(token));
const revealed = await fetch(
  `https://api.supabase.com/v1/projects/${stagingRef}/api-keys/${secretMetadata.id}?reveal=true`,
  {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  },
);
assert(
  revealed.ok,
  `Staging key retrieval failed (${revealed.status}); body withheld.`,
);
const detail = await revealed.json();
assert.equal(detail.id, secretMetadata.id);
assert.equal(detail.type, "secret");
const secret = detail.api_key;
assert(
  /^sb_secret_[A-Za-z0-9_-]+$/.test(secret),
  "Refuse masked/invalid keys.",
);
const probe = await fetch(
  `https://${stagingRef}.supabase.co/auth/v1/admin/users?page=1&per_page=1`,
  {
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  },
);
await probe.body?.cancel();
assert(
  probe.ok,
  `Staging server-key probe failed (${probe.status}); nothing saved.`,
);
const path = resolve(root, ".env.staging-api.local");
assert.equal(
  spawnSync("git", ["check-ignore", "--quiet", path], { cwd: root }).status,
  0,
);
let replaceMasked = false;
if (existsSync(path)) {
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const previous = parseEnv(readFileSync(path, "utf8"));
  assert.equal(previous.SUPABASE_PROJECT_REF, stagingRef);
  assert.equal(previous.SUPABASE_PUBLISHABLE_KEY, publishable);
  assert(
    !/^sb_secret_[A-Za-z0-9_-]+$/.test(previous.SUPABASE_SECRET_KEY),
    "Refuse overwriting an already captured usable key.",
  );
  replaceMasked = true;
}
const fd = openSync(path, replaceMasked ? "w" : "wx", 0o600);
writeFileSync(
  fd,
  `# Server setup only. Do not load this file into Expo.\nSUPABASE_PROJECT_REF=${stagingRef}\nSUPABASE_URL=https://${stagingRef}.supabase.co\nSUPABASE_PUBLISHABLE_KEY=${publishable}\nSUPABASE_SECRET_KEY=${secret}\n`,
);
fsyncSync(fd);
closeSync(fd);
console.log(
  "Verified staging API keys saved to the ignored, owner-readable setup file. No key values printed.",
);
