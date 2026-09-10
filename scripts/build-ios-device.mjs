import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localBuildEnvironment } from "./local-native-environment.mjs";

const root = process.cwd();
const { mode, env } = localBuildEnvironment(root);
const deviceId = process.env.FURNIO_IOS_DEVICE_ID;
if (!deviceId || !/^[A-Za-z0-9-]+$/.test(deviceId)) throw new Error("Set FURNIO_IOS_DEVICE_ID to the connected test device identifier.");
env.DEVELOPER_DIR = "/Users/alipashaamidi/Downloads/Xcode-beta.app/Contents/Developer";
mkdirSync(resolve(root, "output"), { recursive: true });
const logPath = resolve(root, `output/ios-device-${new Date().toISOString().replaceAll(":", "-")}.log`);
const log = createWriteStream(logPath);
console.log(`Signed ${mode} iPhone build. Log: ${logPath}`);
const child = spawn("xcodebuild", [
  "-quiet", "-workspace", "ios/Furnio.xcworkspace", "-scheme", "Furnio",
  "-configuration", "Release", "-sdk", "iphoneos",
  "-destination", `platform=iOS,id=${deviceId}`,
  "-derivedDataPath", "output/xcode-device",
  "-allowProvisioningUpdates", "-allowProvisioningDeviceRegistration",
  "DEVELOPMENT_TEAM=5SY24C9RBH", "CODE_SIGN_STYLE=Automatic",
  "CODE_SIGN_IDENTITY=Apple Development", "ARCHS=arm64", "build",
], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
let tail = "";
function capture(chunk) { log.write(chunk); tail = (tail + chunk.toString()).slice(-7000); }
child.stdout.on("data", capture);
child.stderr.on("data", capture);
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("close", code => {
  log.end();
  if (code !== 0) { console.error(tail); process.exitCode = 1; return; }
  try {
    const config = JSON.parse(readFileSync(resolve(root, "output/xcode-device/Build/Products/Release-iphoneos/Furnio.app/EXConstants.bundle/app.config"), "utf8"));
    if (config.extra?.furnioEnvironment !== mode || config.ios?.bundleIdentifier !== "ai.furnio.app") throw new Error("Embedded configuration mismatch");
    console.log("Signed device build and embedded environment checks passed.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
});
