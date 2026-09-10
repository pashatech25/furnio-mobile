const test = require("node:test");
const assert = require("node:assert/strict");
const { patchAppDelegate, manifest } = require("../plugins/with-ios-scene-lifecycle.cjs");
const fixture = `class AppDelegate: ExpoAppDelegate {
var window: UIWindow?
func startup() {
#if os(iOS) || os(tvOS)
window = UIWindow(frame: UIScreen.main.bounds)
factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
#endif
return super.application(application, didFinishLaunchingWithOptions: launchOptions)
}
}`;
test("scene migration is idempotent and starts React in the scene window", () => {
  const result = patchAppDelegate(fixture);
  assert.equal(patchAppDelegate(result), result);
  assert.equal((result.match(/startReactNative\(/g) || []).length, 1);
  assert.ok(result.includes("UIWindow(windowScene: windowScene)"));
  assert.ok(!result.includes("UIScreen.main.bounds"));
  assert.ok(result.includes("initialLaunchOptions = launchOptions"));
});
test("scene preserves URL, activity and Expo lifecycle forwarding", () => {
  const result = patchAppDelegate(fixture);
  for (const expected of ["options.urlContexts", "options.userActivities", "openURLContexts", "continue: userActivity", "applicationDidBecomeActive", "applicationWillResignActive", "applicationDidEnterBackground", "applicationWillEnterForeground"]) assert.ok(result.includes(expected), expected);
  assert.equal(manifest.UIApplicationSupportsMultipleScenes, false);
});
test("changed upstream startup fails safely", () => {
  assert.throws(() => patchAppDelegate("class AppDelegate {}"), /Review changed/);
});
