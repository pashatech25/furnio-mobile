// Exercise the real Expo Constants generator with this project's space-bearing
// path before spending time on a native build. Output remains ignored/local.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "package.json"));
const { constantsScript } = require("./plugins/with-ios-space-safe-build.cjs");
const constants = dirname(require.resolve("expo-constants/package.json"));
mkdirSync(resolve(root, "output"), { recursive: true });
const directory = mkdtempSync(resolve(root, "output/constants-qa-"));
mkdirSync(resolve(directory, "EXConstants.bundle"));
execFileSync("/bin/bash", ["-c", constantsScript], {
  cwd: root,
  encoding: "utf8",
  timeout: 30_000,
  env: {
    ...process.env,
    NODE_ENV: "production",
    EXPO_PUBLIC_APP_MODE: "demo",
    PROJECT_ROOT: "",
    PROJECT_DIR: resolve(root, "ios/Pods"),
    PODS_TARGET_SRCROOT: resolve(constants, "ios"),
    PODS_ROOT: resolve(root, "ios/Pods"),
    CONFIGURATION_BUILD_DIR: directory,
    BUNDLE_FORMAT: "shallow",
  },
});
const config = JSON.parse(
  readFileSync(resolve(directory, "EXConstants.bundle/app.config"), "utf8"),
);
assert.equal(config.scheme, "furnio");
assert.equal(config.ios.bundleIdentifier, "ai.furnio.app");
assert.equal(config.ios.infoPlist.RCTNewArchEnabled, true);
console.log(
  "Real Expo Constants generation passed with spaces in project paths.",
);
