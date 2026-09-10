// One-off owner-approved provisioning. Never links or mutates production.
// Password is generated at runtime and saved outside Git. The installed CLI
// requires its password flag; no shell, command logging or raw errors are used.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = "/opt/homebrew/bin/supabase";
const organization = "mtbmdoltmytsmmpuklpw";
const name = "Furnio-Mobile-Staging";
const secretPath = resolve(root, ".env.staging.local");
const retryRejectedOptions = process.argv[3] === "--retry-rejected-cli-options";
assert.deepEqual(
  process.argv.slice(2),
  retryRejectedOptions
    ? ["--owner-approved-micro", "--retry-rejected-cli-options"]
    : ["--owner-approved-micro"],
);
const inventory = spawnSync(cli, ["projects", "list", "-o", "json"], {
  cwd: root,
  encoding: "utf8",
  timeout: 30_000,
});
assert.equal(inventory.status, 0, "Project inventory failed; nothing created.");
const projects = JSON.parse(inventory.stdout);
assert(
  projects.some(
    (p) =>
      p.id === "sgsjkgfwgxmlqcgyuyeh" && p.organization_id === organization,
  ),
);
assert(
  !projects.some((p) => p.name === name),
  "Staging already exists. Do not create a duplicate.",
);
assert.equal(
  spawnSync("git", ["check-ignore", "--quiet", secretPath], { cwd: root })
    .status,
  0,
);

let password;
if (retryRejectedOptions) {
  const pending = readFileSync(secretPath, "utf8");
  assert(
    !pending.includes("SUPABASE_PROJECT_REF="),
    "Creation already recorded; do not retry.",
  );
  password = pending.match(/^SUPABASE_DB_PASSWORD=([A-Za-z0-9_-]{48})$/m)?.[1];
  assert(password, "Expected original generated password is missing.");
} else {
  password = randomBytes(36).toString("base64url");
  const fd = openSync(secretPath, "wx", 0o600); // Refuse overwrite/retry after uncertain creation.
  writeFileSync(
    fd,
    `# Staging only. Never expose this file to Expo or commit it.\nSUPABASE_DB_PASSWORD=${password}\n`,
  );
  fsyncSync(fd);
  closeSync(fd);
}
const created = spawnSync(
  cli,
  [
    "projects",
    "create",
    name,
    "--org-id",
    organization,
    "--region",
    "us-east-1",
    "--size",
    "micro",
    "--db-password",
    password,
    "-o",
    "json",
  ],
  {
    cwd: root,
    encoding: "utf8",
    input: `${password}\n`,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60_000,
  },
);
if (created.status !== 0) {
  // Do not print raw commands, errors or a possibly echoed password.
  console.error(
    "Creation did not return success. Inspect project inventory before retrying. Saved password preserved.",
  );
  console.error(
    String(created.stderr || "")
      .replaceAll(password, "[REDACTED]")
      .slice(0, 1500),
  );
  process.exit(1);
}
const project = JSON.parse(created.stdout);
assert.equal(project.name, name);
assert.equal(project.organization_id, organization);
assert.equal(project.region, "us-east-1");
assert(/^[a-z]{20}$/.test(project.id));
assert.notEqual(project.id, "sgsjkgfwgxmlqcgyuyeh");
writeFileSync(
  secretPath,
  `${readFileSync(secretPath, "utf8")}SUPABASE_PROJECT_REF=${project.id}\nSUPABASE_URL=https://${project.id}.supabase.co\n`,
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    id: project.id,
    name: project.name,
    organization_id: project.organization_id,
    region: project.region,
    status: project.status,
  }),
);
console.log(
  "Password saved to ignored, owner-readable .env.staging.local; no production link changed.",
);
