import { spawn } from "node:child_process";
import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localBuildEnvironment } from "./local-native-environment.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { mode, env } = localBuildEnvironment(root);
// CocoaPods records pnpm's physical package path. A patched JS dependency can
// otherwise leave Xcode compiling the old native source while its build passes.
const svgRoot = realpathSync(resolve(root, "node_modules/react-native-svg"));
const svgSource = readFileSync(
  resolve(svgRoot, "apple/Elements/RNSVGSvgView.mm"),
  "utf8",
);
const svgMeasurement = readFileSync(
  resolve(svgRoot, "apple/RNSVGRenderableModule.mm"),
  "utf8",
);
const podsRoot = resolve(root, "ios/Pods");
const podsProject = readFileSync(
  resolve(podsRoot, "Pods.xcodeproj/project.pbxproj"),
  "utf8",
);
// The temporary local Release-only archive override must not silently return:
// normal CocoaPods metadata selects the right upstream Debug/Release framework.
const rnVersion = JSON.parse(
  readFileSync(resolve(root, "node_modules/react-native/package.json"), "utf8"),
).version;
for (const [name, artifact, phase] of [
  [
    "React-Core-prebuilt",
    "reactnative-core",
    "[RNCore] Replace React Native Core for the right configuration, if needed",
  ],
  [
    "ReactNativeDependencies",
    "reactnative-dependencies",
    "[RNDeps] Replace React Native Dependencies for the right configuration, if needed",
  ],
]) {
  const spec = JSON.parse(
    readFileSync(
      resolve(podsRoot, "Local Podspecs", `${name}.podspec.json`),
      "utf8",
    ),
  );
  const expectedUrl = `https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/${rnVersion}/react-native-artifacts-${rnVersion}-${artifact}-debug.tar.gz`;
  if (
    spec.version !== rnVersion ||
    spec.source?.http !== expectedUrl ||
    spec.script_phases?.name !== phase ||
    !podsProject.includes(phase)
  ) {
    throw new Error(
      `${name} still uses unsupported local/stale pod metadata. Refresh only React-Core-prebuilt and ReactNativeDependencies with pod update --no-repo-update, without RCT_TESTONLY_RNCORE_TARBALL_PATH or RCT_USE_LOCAL_RN_DEP. Do not change dependency versions or global Xcode settings.`,
    );
  }
}
if (
  !svgSource.includes("format.scale = 1;") ||
  !svgSource.includes(
    "drawToContext:rendererContext.CGContext withRect:bounds",
  ) ||
  !svgMeasurement.includes(
    "bounds = [self getBBoxOnMainThread:reactTag options:options];",
  ) ||
  !svgMeasurement.includes(
    "dispatch_sync(dispatch_get_main_queue(), measure);",
  ) ||
  !svgMeasurement.includes(
    "[svg.svgView getDataURLWithBounds:CGRectMake(0, 0, 1, 1)]",
  ) ||
  !podsProject.includes(`path = "${relative(podsRoot, svgRoot)}";`)
) {
  throw new Error(
    "Furnio's SVG pixel-export/thread-safety patch is missing or CocoaPods points at an old copy. Run pnpm install, then pod install --no-repo-update in ios with the approved Xcode before rebuilding.",
  );
}
const output = resolve(root, "output");
mkdirSync(output, { recursive: true });
const logPath = resolve(
  output,
  `ios-simulator-${new Date().toISOString().replaceAll(":", "-")}.log`,
);
const log = createWriteStream(logPath);
console.log(`Local ${mode} Release simulator build; full log: ${logPath}`);
const child = spawn(
  "xcodebuild",
  [
    "-quiet",
    "-workspace",
    "ios/Furnio.xcworkspace",
    "-scheme",
    "Furnio",
    "-configuration",
    "Release",
    "-sdk",
    "iphonesimulator",
    "-destination",
    "generic/platform=iOS Simulator",
    "-derivedDataPath",
    "output/xcode-simulator",
    `ARCHS=${process.arch === "arm64" ? "arm64" : "x86_64"}`,
    "ONLY_ACTIVE_ARCH=YES",
    // Local simulator ad-hoc signing is needed for app-scoped Keychain access.
    // This uses no Apple account/certificate and cannot produce a store build.
    "CODE_SIGNING_ALLOWED=YES",
    "CODE_SIGN_IDENTITY=-",
    "build",
  ],
  {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let tail = "";
function capture(chunk) {
  log.write(chunk);
  tail = (tail + chunk.toString()).slice(-8000);
}
child.stdout.on("data", capture);
child.stderr.on("data", capture);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("error", (error) => {
  log.end();
  console.error(error.message);
  process.exitCode = 1;
});
child.on("close", (code) => {
  log.end();
  if (code === 0) {
    try {
      const config = JSON.parse(
        readFileSync(
          resolve(
            output,
            "xcode-simulator/Build/Products/Release-iphonesimulator/Furnio.app/EXConstants.bundle/app.config",
          ),
          "utf8",
        ),
      );
      if (
        config.extra?.furnioEnvironment !== mode ||
        config.scheme !== "furnio" ||
        config.ios?.bundleIdentifier !== "ai.furnio.app"
      )
        throw new Error("Embedded Expo identity does not match Furnio.");
    } catch (error) {
      console.error(`Build output is incomplete: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      "iOS simulator Release build and embedded configuration check succeeded. This is not a signed device/store build.",
    );
  } else
    console.error(
      `iOS simulator build failed (${code}). Last output:\n${tail}`,
    );
  process.exitCode = code === 0 ? 0 : 1;
});
