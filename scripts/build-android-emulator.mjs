import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localBuildEnvironment } from "./local-native-environment.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { mode, env } = localBuildEnvironment(root);
const sdk = resolve(
  process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    resolve(homedir(), "Library/Android/sdk"),
);
const architecture = process.arch === "arm64" ? "arm64-v8a" : "x86_64";
for (const path of [
  "platforms/android-36/android.jar",
  "build-tools/36.0.0/aapt",
  "ndk/27.1.12297006/source.properties",
]) {
  if (!existsSync(resolve(sdk, path))) {
    throw new Error(
      `Missing Android SDK prerequisite: ${path}. See docs/LAPTOP_SETUP.md.`,
    );
  }
}
if (!existsSync(resolve(root, "android/gradlew"))) {
  throw new Error(
    "Generate the Android native project using the approved Expo prebuild before building.",
  );
}
const output = resolve(root, "output");
mkdirSync(output, { recursive: true });
const logPath = resolve(
  output,
  `android-emulator-${new Date().toISOString().replaceAll(":", "-")}.log`,
);
const log = createWriteStream(logPath);
Object.assign(env, {
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  NODE_ENV: "production",
  EXPO_NO_DOTENV: "1",
  CI: "1",
});
console.log(
  `Local Android ${architecture} Release ${mode} build. Not a store-signed build.\nFull log: ${logPath}`,
);
const child = spawn(
  "./gradlew",
  [
    // Gradle does not track EXPO_PUBLIC changes as JS task inputs. Rerun only
    // bundling so switching demo/staging cannot reuse the other environment.
    ":app:createBundleReleaseJsAndAssets",
    "--rerun",
    ":app:assembleRelease",
    `-PreactNativeArchitectures=${architecture}`,
    "--no-daemon",
    "--max-workers=2",
    "--console=plain",
  ],
  { cwd: resolve(root, "android"), env, stdio: ["ignore", "pipe", "pipe"] },
);
let tail = "";
const capture = (chunk) => {
  log.write(chunk);
  tail = (tail + chunk.toString()).slice(-12000);
};
child.stdout.on("data", capture);
child.stderr.on("data", capture);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("close", (code) => {
  log.end();
  if (code !== 0) {
    console.error(`Android build failed (${code}). Last output:\n${tail}`);
    process.exitCode = 1;
    return;
  }
  try {
    const apk = resolve(
      root,
      "android/app/build/outputs/apk/release/app-release.apk",
    );
    const manifest = spawnSync(
      resolve(sdk, "build-tools/36.0.0/aapt"),
      ["dump", "badging", apk],
      { encoding: "utf8" },
    );
    if (
      manifest.status !== 0 ||
      !/^package: name='ai\.furnio\.app'/m.test(manifest.stdout)
    ) {
      throw new Error(
        "Built APK does not identify the expected Furnio application.",
      );
    }
    const files = spawnSync("unzip", ["-Z1", apk], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    if (
      files.status !== 0 ||
      !files.stdout.split("\n").includes("assets/index.android.bundle")
    ) {
      throw new Error(
        "APK has no embedded JavaScript bundle; do not launch it against a dev server.",
      );
    }
    console.log(
      `Android ${mode} APK built and package/bundle checks passed.\nAPK: ${apk}\nSHA256: ${createHash("sha256").update(readFileSync(apk)).digest("hex")}`,
    );
  } catch (error) {
    console.error(`Build verification failed: ${error.message}`);
    process.exitCode = 1;
  }
});
