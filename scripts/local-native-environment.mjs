import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export const stagingPublicValues = {
  EXPO_PUBLIC_APP_MODE: "staging",
  EXPO_PUBLIC_PLATFORM_API_URL:
    "https://furnio-api-mobile-staging.amidi-alipasha.workers.dev",
  EXPO_PUBLIC_MOBILE_API_URL:
    "https://furnio-mobile-staging.amidi-alipasha.workers.dev",
  EXPO_PUBLIC_SUPABASE_URL: "https://bcrobmrimzkvfrnqarmv.supabase.co",
  EXPO_PUBLIC_PURCHASES_ENABLED: "false",
};

// Explicit owner-authorized production build, never a fallback from staging.
export const productionPublicValues = {
  EXPO_PUBLIC_APP_MODE: "production",
  EXPO_PUBLIC_PLATFORM_API_URL: "https://platform.furnio.ai",
  EXPO_PUBLIC_MOBILE_API_URL: "https://mobile-api.furnio.ai",
  EXPO_PUBLIC_SUPABASE_URL: "https://auth.furnio.ai",
  EXPO_PUBLIC_PURCHASES_ENABLED: "false",
};

// Native builds receive only a separately prepared PUBLIC configuration file.
// Never load database/server credentials through Expo dotenv discovery.
export function nativeBuildEnvironment(mode, ambient, values = {}) {
  assert(
    ["demo", "staging", "production"].includes(mode),
    "Unknown native environment",
  );
  const env = Object.fromEntries(
    Object.entries(ambient).filter(
      ([key]) =>
        !/^(EXPO_PUBLIC_|SUPABASE_|PG|CLOUDFLARE_|CF_|REVENUECAT_|STRIPE_|FAL_|WRANGLER_)/.test(
          key,
        ),
    ),
  );
  Object.assign(env, {
    NODE_ENV: "production",
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_APP_MODE: mode,
    EXPO_PUBLIC_PURCHASES_ENABLED: "false",
  });
  if (mode !== "demo") {
    const pinned = mode === "production" ? productionPublicValues : stagingPublicValues;
    assert.deepEqual(
      Object.keys(values).sort(),
      [
        ...Object.keys(pinned),
        "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN",
      ].sort(),
      "Unexpected native build fields",
    );
    for (const [key, expected] of Object.entries(pinned))
      assert.equal(values[key], expected, `Invalid ${mode} ${key}`);
    assert(
      /^sb_publishable_[A-Za-z0-9_-]+$/.test(
        values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      ),
      "A public Supabase key is required",
    );
    assert(/^pk\.[A-Za-z0-9_.-]+$/.test(values.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN),
      "Only a public Mapbox token may enter the native build");
    Object.assign(env, values);
  }
  return env;
}

export function localBuildEnvironment(root, args = process.argv.slice(2)) {
  assert(
    args.length === 0 || (args.length === 1 && ["--staging", "--production"].includes(args[0])),
    "Use no arguments (demo), --staging, or --production",
  );
  const mode = args.length ? args[0].slice(2) : "demo";
  const values =
    mode !== "demo"
      ? parseEnv(
          readFileSync(resolve(root, `.env.${mode}-native.local`), "utf8"),
        )
      : {};
  return { mode, env: nativeBuildEnvironment(mode, process.env, values) };
}
