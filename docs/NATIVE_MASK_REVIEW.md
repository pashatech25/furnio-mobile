# Native mask review and pixel export

9 September 2026. This is local mobile work; no website or processing Worker deployment is included.

## Customer interaction

Item removal and Custom staging now have **Review selection** below the region controls, including the shared batch editor. It opens a native sheet using the same exporter as real job preparation:

- Each painted region is selectable by its original region number.
- **Show black-and-white mask** displays the actual exported PNG: white is selected, black is outside that region.
- **Show on photo** displays the exported transparent mask tinted over the original photo. This is a mask overlay, not an AI-generated result.
- The sheet shows the verified pixel dimensions and number of painted regions.
- **Back to editing** closes review without changing the painted regions or starting processing.

Review makes no API, upload, purchase or image-generation request. It writes no explicit export file; its PNG strings are held in memory and released from React state on close/unmount. Native image/OS cache behaviour is not claimed as complete device-data erasure. Closing/unmounting ignores late results. The browser design preview does not offer native export.

The existing demo **Preview the processing experience** still skips real job submission; it is not a substitute for this export check. Real upload/submission uses the same `exportPaintRegions`/`captureMaskPng` path, with the original request shape preserved.

## Export validation

The exporter rejects empty selections, missing custom-region instructions, more than eight regions, invalid PNG data, more than 5 MiB decoded data, incorrect pixel dimensions, renderer/decoder errors and timeouts. It only asks the native decoder to inspect a local data URI. Native error details and file paths are not surfaced.

The capture and decode stages share a ten-second timeout. Duplicate/late callbacks are ignored. Failure in one region does not return a partial successful export list. No paid request is retried or triggered by review.

## Native defect found by this check

The first real simulator export failed with **Mask export dimensions do not match the photo**. Inspection of installed `react-native-svg` 15.15.4 found its iOS `getDataURLWithBounds` using `UIGraphicsImageRenderer` at the display's default Retina scale. Its Android implementation creates a bitmap with the requested pixel width/height directly. iOS also integer-truncates the requested drawing bounds, so dividing dimensions by the screen scale is not a reliable exact-pixel fix.

A version-pinned pnpm patch sets the iOS export renderer's `format.scale = 1` and `format.opaque = NO`. The next actual-pixel test exposed a second defect: exported dimensions were correct but the black-and-white image was blank. The library's `drawRect` used the hidden renderer's on-screen **1×1 bounds** instead of the requested export rectangle. The patch now draws directly into the export context with the requested bounds and restores the previous bounding-box metadata afterwards. Normal on-screen SVG drawing and Android code are untouched. This preserves the requested pixel dimensions, geometry and mask transparency instead of rescaling the selection after rendering. The same library backs disclosure exports, so complete disclosure-JPEG native regression remains a release gate.

Tracked patch: `patches/react-native-svg@15.15.4.patch`, registered in `pnpm-workspace.yaml` and hashed in `pnpm-lock.yaml`. Do not silently drop it during dependency upgrades; evaluate the upstream replacement and rerun native mask/disclosure pixel tests. `native-svg-patch.test.ts` checks that the installed source actually contains the pinned fix; this source check alone is not native acceptance.

## CocoaPods stale-path finding

**Superseded workaround, 9 September18:12:** upstream availability/checksums are now verified and normal HTTPS pod sources/configuration phases are restored. The resulting Release app builds/opens. Read `IOS_DEPENDENCY_READINESS.md`; do not reapply the historical test-only tarball overrides below during ordinary builds.

The first rebuild after applying the pnpm patch still used the old native object. CocoaPods had saved pnpm's **physical old package directory**, while JavaScript resolved the newly patched package. A successful build therefore did not prove the patch was compiled.

`scripts/build-ios-simulator.mjs` now checks both the installed patch and CocoaPods' reference to that exact physical directory before building. A mismatch fails early with instructions to reinstall the project's pods. No global Xcode selection is changed.

During `pod install --no-repo-update`, both default/alternate Maven URLs redirected to a missing `repo.reactnative.dev` artifact (HTTP 404), causing automatic fallback to source compilation. This was an upstream artifact lookup failure, not evidence of broken Wi-Fi. The already cached React Native 0.86.3 **Release** archives from this project's earlier successful setup were used through the library's documented local/test-only environment hooks, scoped to that one pod-install command:

- `RCT_TESTONLY_RNCORE_TARBALL_PATH`: `ios/Pods/ReactNativeCore-artifacts/reactnative-core-0.86.3-release.tar.gz`; SHA256 `05359752100c0db4be9229423fc673eb3b981ba97aa6210707b878a708320a98`.
- `RCT_USE_LOCAL_RN_DEP`: `ios/Pods/ReactNativeDependencies-artifacts/reactnative-dependencies-0.86.3-release.tar.gz`; SHA256 `5e06070fdad3315f9f3020283d16875395f93e8a59e175be36d8971e64095892`.
- The extracted `React.xcframework` passed `codesign --verify --deep --strict` before this simulator build.

These are **local Release-simulator build inputs**, not a certified Debug/store/CI dependency setup or a request to use arbitrary binaries. No TLS validation, DNS, proxy, firewall or global build settings were disabled. Clean dependency installation and store builds still require their own reproducible upstream-artifact validation.

## Verification record

- Mobile: **672 tests / 43 files**, TypeScript and frozen customer contracts passed.
- New exporter coverage: 27 tests, plus the installed native-patch source check. Decoder calls are mocked in these unit tests; native acceptance is recorded separately.
- Native pre-patch test reproduced the dimension mismatch; the first post-patch rebuild was rejected as evidence after discovering stale CocoaPods references.
- Refreshed-pod beta Release build `output/ios-simulator-2026-09-09T15-50-23.447Z.log` passed and produced a correctly sized 2048×1536 PNG, but **visual acceptance failed** because it was blank. That evidence triggered the second drawing-bounds correction above. Do not present that intermediate build as an export pass.
- **Final corrected build:** `output/ios-simulator-2026-09-09T15-56-28.459Z.log` passed Release compilation and embedded demo-configuration validation. Installed at about noon Toronto in Furnio Mobile QA. Built and installed native executables both have SHA256 `5deb6d9504d0e0ec5dfc0d2ed47f3fc5d6350f4b00fd8157d290c16a5314cd17`; JS bundle SHA256 is `7ad6778baaf138a0b19d28a89c36540d388c8e70fcbc3cc8704c5c2f3ea203dd`. Checking the native executable matters here because native patches can change without changing the JS bundle.
- **Native pixel acceptance, 12:01–12:03 Toronto:** the Apple simulator flower image exported at verified **2048×1536**. Region 1's white mark appeared at the painted upper-left relative location. After Back to editing and adding Region 2 at a different lower-right location, the review displayed two separate region tabs and the correct distinct white mark for each, with neither leaking into the other's binary PNG. Transparent overlay positions matched the binary marks and the original photo stayed visible outside the marks.
- Returning to editing/reopening retained Region 1. Undo on Region 2 removed only its last mark; the next export showed only Region 1, skipping the now-empty second region. No processing action was used.
- **Scope limit:** automated drags produced individual marks rather than complete strokes. These checks certify dimensions, visible/nonblank export, point alignment, region separation, re-export and Undo for this image—not arbitrary full-stroke geometry, every aspect ratio, memory pressure or batch acceptance. The owner's earlier human all-direction drawing pass is separate evidence and does not need repeating.
- Batch masks, larger manual painted-shape export, brush-size changes, final disclosure-JPEG export, physical devices and authenticated staging processing remain distinct release gates.

No mask was uploaded, no real photo-processing job was started, and no credits were consumed by these checks.
