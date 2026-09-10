import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const stagingRef = "bcrobmrimzkvfrnqarmv";
const credentials = parseEnv(
  readFileSync(resolve(root, ".env.staging.local"), "utf8"),
);
assert.equal(
  credentials.SUPABASE_PROJECT_REF,
  stagingRef,
  "Refuse non-staging database",
);
assert.equal(credentials.SUPABASE_URL, `https://${stagingRef}.supabase.co`);
assert(credentials.SUPABASE_DB_PASSWORD);
const certificate = resolve(root, "output/staging-supabase-ca.crt");
assert.equal(
  new X509Certificate(readFileSync(certificate)).fingerprint256,
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
);

// Fixed staging pooler/user, verified provider CA, no inherited libpq routing,
// no raw CLI exception/command logging and no production credentials.
export function stagingSql(query) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
  );
  const result = spawnSync(
    "/opt/homebrew/bin/psql",
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    {
      input: query,
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...env,
        PGHOST: "aws-0-us-east-1.pooler.supabase.com",
        PGPORT: "5432",
        PGUSER: `postgres.${stagingRef}`,
        PGDATABASE: "postgres",
        PGPASSWORD: credentials.SUPABASE_DB_PASSWORD,
        PGSSLMODE: "verify-full",
        PGSSLROOTCERT: certificate,
        PGCONNECT_TIMEOUT: "10",
        PGAPPNAME: "furnio-mobile-staging-setup",
        PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=5000",
      },
    },
  );
  if (result.status !== 0)
    throw new Error(
      String(result.stderr || "Staging SQL failed").replaceAll(
        credentials.SUPABASE_DB_PASSWORD,
        "[REDACTED]",
      ),
    );
  return result.stdout.trim();
}
