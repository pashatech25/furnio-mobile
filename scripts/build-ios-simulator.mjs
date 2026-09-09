import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "output");
mkdirSync(output, { recursive: true });
const logPath = resolve(
  output,
  `ios-simulator-${new Date().toISOString().replaceAll(":", "-")}.log`,
);
const log = createWriteStream(logPath);
console.log(`Local demo Release simulator build; full log: ${logPath}`);
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
    "CODE_SIGNING_ALLOWED=NO",
    "build",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      EXPO_PUBLIC_APP_MODE: "demo",
    },
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
