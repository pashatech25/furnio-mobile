import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sources = [
  ["admin", resolve(root, "../Furnio Admin/supabase/migrations")],
  ["main", resolve(root, "../AI Virtual Staging/supabase/migrations")],
];
const migrations = sources
  .flatMap(([source, directory]) =>
    readdirSync(directory)
      .filter((file) => /^\d{14}_.+\.sql$/.test(file))
      .map((file) => ({
        source,
        file,
        sql: readFileSync(resolve(directory, file), "utf8"),
      })),
  )
  .sort(
    (a, b) =>
      a.file.slice(0, 14).localeCompare(b.file.slice(0, 14)) ||
      a.source.localeCompare(b.source),
  );
// These two independent repositories share one timestamp. Apply Admin's
// package entitlement before Main's property functions that can consume it.
const collisions = migrations.filter(
  (migration, index) =>
    index > 0 &&
    migration.file.slice(0, 14) === migrations[index - 1].file.slice(0, 14),
);
assert.deepEqual(
  collisions.map((item) => item.file),
  ["20260828032738_property_batch_retention.sql"],
);
assert.equal(migrations[0]?.file, "20260827063752_foundation.sql");

const owner = "furnio-mobile-isolated-schema-test";
const name = `furnio-mobile-schema-${randomUUID()}`;
const image = "postgres:17-alpine";
let containerId;
function docker(args, input) {
  return execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}
function sql(input) {
  return docker(
    [
      "exec",
      "-i",
      containerId,
      "psql",
      "-X",
      "-q",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    input,
  );
}
const digest = createHash("sha256");
for (const migration of migrations)
  digest.update(`${migration.source}/${migration.file}\0${migration.sql}\0`);
console.log(
  `Replaying ${migrations.length} application migrations; SHA256 ${digest.digest("hex")}`,
);
try {
  // Existing image only. No host ports, network, mounts, persistent data or
  // production credentials; the Postgres data directory is RAM-only.
  containerId = docker([
    "run",
    "--detach",
    "--rm",
    "--pull=never",
    "--name",
    name,
    "--label",
    `furnio.test.owner=${owner}`,
    "--network",
    "none",
    "--memory",
    "768m",
    "--cpus",
    "1",
    "--tmpfs",
    "/var/lib/postgresql/data:rw,size=512m",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    image,
  ]).trim();
  assert.match(containerId, /^[a-f0-9]{64}$/);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      docker([
        "exec",
        containerId,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
      ]);
      ready = true;
      break;
    } catch {
      await new Promise((done) => setTimeout(done, 250));
    }
  }
  assert.ok(ready, "Isolated PostgreSQL startup");
  sql(
    readFileSync(resolve(root, "backend/tests/schema-bootstrap.sql"), "utf8"),
  );
  for (const migration of migrations) {
    console.log(`Apply ${migration.source}/${migration.file}`);
    // Separate connections preserve committed enum migrations and each file's
    // explicit transaction boundaries. No rewrites or error-skipping allowed.
    const isTrialCompatibility = migration.file.endsWith(
      "_native_unstarted_trial_conversion.sql",
    );
    const conversionBefore = isTrialCompatibility
      ? sql(
          "select pg_get_functiondef('public.convert_trial_on_payment(uuid,text)'::regprocedure)",
        )
      : null;
    sql(migration.sql);
    if (isTrialCompatibility)
      assert.equal(
        sql(
          "select pg_get_functiondef('public.convert_trial_on_payment(uuid,text)'::regprocedure)",
        ),
        conversionBefore,
        "The installed shared trial conversion function remains byte-identical",
      );
  }
  const cases = sql(
    readFileSync(resolve(root, "backend/tests/schema-cases.sql"), "utf8"),
  );
  console.log(cases);
  console.log(
    "Complete application-schema replay passed (Auth/Storage stand-ins only).",
  );
} catch (error) {
  // Only SQL from our synthetic fixture can reach stderr; no live connection.
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  if (containerId) {
    const actualOwner = docker([
      "inspect",
      "--format",
      '{{index .Config.Labels "furnio.test.owner"}}',
      containerId,
    ]).trim();
    assert.equal(
      actualOwner,
      owner,
      "Refuse to remove a container not owned by this test",
    );
    docker(["rm", "--force", containerId]);
    console.log("Removed only the owned RAM-only schema fixture.");
  }
}
