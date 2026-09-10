import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import {
  nativeBuildEnvironment,
  stagingPublicValues,
} from "./local-native-environment.mjs";

assert.deepEqual(process.argv.slice(2), ["--staging-only"]);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = parseEnv(
  readFileSync(resolve(root, ".env.staging-api.local"), "utf8"),
);
assert.equal(source.SUPABASE_PROJECT_REF, "bcrobmrimzkvfrnqarmv");
// Keep the native public token separate from the website's URL-restricted one.
// The existing file is a temporary diagnostic fallback, not map acceptance.
const nativeMapsPath = resolve(root, ".env.staging-maps.local");
let mapToken;
if (existsSync(nativeMapsPath)) {
  const maps = parseEnv(readFileSync(nativeMapsPath, "utf8"));
  assert.deepEqual(Object.keys(maps), ["EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN"]);
  mapToken = maps.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
} else {
  mapToken = parseEnv(readFileSync(resolve(root, "../AI Virtual Staging/apps/web/.env"), "utf8")).VITE_MAPBOX_PUBLIC_TOKEN;
  console.warn("Native Mapbox key is pending. Website key is diagnostic only and rejects native requests; map tests cannot pass yet.");
}
const values = {
  ...stagingPublicValues,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: source.SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN: mapToken,
};
nativeBuildEnvironment("staging", {}, values);
writeFileSync(
  resolve(root, ".env.staging-native.local"),
  Object.entries(values)
    .map(([k, v]) => `${k}=${v}\n`)
    .join(""),
  { mode: 0o600 },
);
console.log(
  "Prepared public-only, staging-pinned native configuration. No server credentials copied.",
);
