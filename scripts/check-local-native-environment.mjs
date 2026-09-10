import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nativeBuildEnvironment,
  stagingPublicValues,
} from "./local-native-environment.mjs";
const fixture = {
  ...stagingPublicValues,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN: "pk.public-map-fixture",
};
test("staging admits only pinned public configuration and keeps purchases off", () => {
  const env = nativeBuildEnvironment(
    "staging",
    {
      PATH: "/bin",
      SUPABASE_SECRET_KEY: "secret",
      PGPASSWORD: "secret",
      FAL_KEY: "secret",
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: "live",
    },
    fixture,
  );
  assert.equal(env.PATH, "/bin");
  for (const key of [
    "SUPABASE_SECRET_KEY",
    "PGPASSWORD",
    "FAL_KEY",
    "EXPO_PUBLIC_REVENUECAT_IOS_KEY",
  ])
    assert.equal(env[key], undefined);
  assert.equal(env.EXPO_NO_DOTENV, "1");
  assert.equal(env.EXPO_PUBLIC_PURCHASES_ENABLED, "false");
  assert.equal(env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN, fixture.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN);
});
test("demo discards ambient production endpoints", () => {
  const env = nativeBuildEnvironment("demo", {
    EXPO_PUBLIC_APP_MODE: "production",
    EXPO_PUBLIC_PLATFORM_API_URL: "https://platform.furnio.ai",
  });
  assert.equal(env.EXPO_PUBLIC_APP_MODE, "demo");
  assert.equal(env.EXPO_PUBLIC_PLATFORM_API_URL, undefined);
});
test("rejects production, missing configuration, extra fields, live URLs, and secret keys", () => {
  assert.throws(() => nativeBuildEnvironment("production", {}));
  assert.throws(() => nativeBuildEnvironment("staging", {}));
  assert.throws(() => nativeBuildEnvironment("staging", {}, {
    ...fixture, EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN: "sk.private-map-token",
  }));
  assert.throws(() =>
    nativeBuildEnvironment("staging", {}, { ...fixture, OTHER: "x" }),
  );
  assert.throws(() =>
    nativeBuildEnvironment(
      "staging",
      {},
      {
        ...fixture,
        EXPO_PUBLIC_PLATFORM_API_URL: "https://platform.furnio.ai",
      },
    ),
  );
  assert.throws(() =>
    nativeBuildEnvironment(
      "staging",
      {},
      { ...fixture, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_bad" },
    ),
  );
  assert.throws(() =>
    nativeBuildEnvironment(
      "staging",
      {},
      { ...fixture, EXPO_PUBLIC_PURCHASES_ENABLED: "true" },
    ),
  );
});
