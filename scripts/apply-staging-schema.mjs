import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { root, stagingRef, stagingSql } from "./staging-db.mjs";

assert.deepEqual(process.argv.slice(2), ["--apply-approved-staging"]);
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
const digest = createHash("sha256");
for (const migration of migrations)
  digest.update(`${migration.source}/${migration.file}\0${migration.sql}\0`);
assert.equal(
  digest.digest("hex"),
  "5128d50b067698d0d125f04cc688e9078bfa7717e46b0b3e4a7c8d0bc82ca1a7",
  "Migration contents changed since reviewed full-schema acceptance. Stop and review.",
);
assert.equal(migrations.length, 60);
// This is data-only production transition cleanup, not application schema.
const selected = migrations.filter(
  (m) => m.file !== "20260831092206_prepare_stripe_live_mode.sql",
);
assert.equal(selected.length, 59);
assert.equal(
  stagingSql(
    "select (select count(*) from auth.users) + (select count(*) from storage.objects);",
  ),
  "0",
  "Initial schema installer refuses projects with accounts or media",
);
const hasHistory =
  stagingSql(
    "select to_regclass('private.staging_schema_migrations') is not null;",
  ) === "t";
if (!hasHistory) {
  assert.equal(
    stagingSql("select count(*) from pg_tables where schemaname='public';"),
    "0",
    "Not a fresh database",
  );
  stagingSql(`begin;
    create schema if not exists private;
    revoke all on schema private from public, anon, authenticated;
    create table private.staging_schema_migrations (
      source_file text primary key, sha256 text not null, applied_at timestamptz not null default now()
    );
    revoke all on private.staging_schema_migrations from public, anon, authenticated;
    comment on table private.staging_schema_migrations is 'Staging-only bootstrap audit: original Main/Admin file names retained; not production Supabase migration history';
    commit;`);
}
for (const migration of selected) {
  const key = `${migration.source}/${migration.file}`;
  assert(/^[a-z]+\/[0-9a-z_]+\.sql$/.test(key));
  const hash = createHash("sha256").update(migration.sql).digest("hex");
  const applied = stagingSql(
    `select sha256 from private.staging_schema_migrations where source_file='${key}';`,
  );
  if (applied) {
    assert.equal(applied, hash, `Applied migration drift: ${key}`);
    continue;
  }
  const record = `insert into private.staging_schema_migrations(source_file,sha256) values ('${key}','${hash}');`;
  const beginCount = (migration.sql.match(/^begin;\s*$/gim) || []).length;
  const commitCount = (migration.sql.match(/^commit;\s*$/gim) || []).length;
  assert(
    beginCount === commitCount && [0, 1].includes(beginCount),
    `Unexpected transaction boundaries: ${key}`,
  );
  // Audit insert commits atomically with its source migration. Enum-only files
  // get their own transaction and commit before the following migration.
  const sql = commitCount
    ? migration.sql.replace(/^commit;\s*$/im, `${record}\ncommit;`)
    : `begin;\n${migration.sql}\n${record}\ncommit;`;
  console.log(`Apply ${key}`);
  stagingSql(sql);
}
assert.equal(
  stagingSql("select count(*) from private.staging_schema_migrations;"),
  "59",
);
console.log(
  `Applied 59 reviewed schema migrations to ${stagingRef}; Stripe live-mode cleanup excluded.`,
);
console.log(
  stagingSql(`select json_build_object(
  'public_tables',(select count(*) from pg_tables where schemaname='public'),
  'users',(select count(*) from auth.users),
  'unprotected_public_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
  'native_settings',(select row_to_json(s) from private.native_commerce_settings s),
  'deletion_settings',(select row_to_json(s) from private.mobile_account_settings s)
);`),
);
