# Physical iPhone installation — September 10, 2026

- Owner connected iPhone 17 Pro Max, iOS 27.0. Xcode reported paired and Developer Mode enabled.
- Built Release for the connected physical device using existing Apple Development signing and team 5SY24C9RBH. Automatic provisioning succeeded after targeting the actual device instead of a generic destination.
- Production public configuration verified in embedded Expo config. Native purchases remain disabled. No web or backend configuration changed.
- `codesign --verify --deep --strict` passed, and `devicectl device install app` confirmed `ai.furnio.app` installed.
- Build log: ignored `output/ios-device-2026-09-10T04-55-16.532Z.log`.
- Rebuild: set `FURNIO_IOS_DEVICE_ID` to the connected device identifier and run `node scripts/build-ios-device.mjs --production`.
- This is direct development-signed installation, not TestFlight or public release. Installation alone does not establish full end-to-end acceptance. Owner testing uses real production account, credits and services.

## Launch crash and repair

The initial installation crashed immediately with SIGTRAP in `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke` on iOS 27. The prior install/launch command success did not prove the app stayed alive.

Added app-owned `with-ios-scene-lifecycle.cjs` config plugin: a single UIWindowScene creates the window and starts React; URL/user-activity delivery and Expo lifecycle subscribers are forwarded. No auth, server, credit or processing rules changed. Three plugin regression tests and TypeScript pass. Corrected signed device build `ios-device-2026-09-10T05-00-08.122Z.log` passed and was installed; attached launch console remained running rather than immediately terminating. Screenshot saved in ignored `output/iphone-scene-fix.png` for visual inspection.
