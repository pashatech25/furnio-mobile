# Xcode beta verification — 9 September 2026

This is local simulator evidence, not store, physical-device or staging certification.

## 13:56 Toronto follow-up — service inputs and native text race

The final beta Release/configuration build `output/ios-simulator-2026-09-09T17-46-48.797Z.log` passed and is installed. Executable SHA256 `1a4614c839f613453dc452fc8f3ca00de98b7f3ac57fd20af1757b2c321b02d1` and JS SHA256 `25bf7b2b052aeae87cd5a122be9580d6c0c3aa86681ef9492e281fbd17616154` match the built files. Native reference placement/demo/result/Back passed; the pin remained 55%/50%. Actual 80-character Georgia/top-centre and no-label JPEGs remained 4032 × 3024. Hidden-invalid-colour off/on validation, font/position update smoke tests and cancellation cleanup passed. The app is on Home. See `STUDIO_INPUT_NATIVE_QA.md` for the earlier 13:31 native crash, intermediate measurement rejection, tracked native dependency fix and finite verification limits. Source checks: **846 tests / 50 files**, TypeScript and contracts passed. A RevenueCat SwiftCompile diagnostic with exit code 0 and other beta/framework warnings remain despite build completion; not a clean-log or signed/store build. No real generation, external photo sharing, additional Photos save or production change.

## 13:15 Toronto follow-up — result-export restart recovery

Build `output/ios-simulator-2026-09-09T17-11-12.106Z.log` and installed JS hash verification passed. The actual disclosure JPEG share sheet retained its owned files while open and cleaned them on cancellation. Terminating/relaunching only this demo app retained an interrupted share; an injected expired hold and partial-write fixture were reclaimed after restart. An unknown sentinel remained untouched and showed a non-blocking notice; sample entry and Retry worked. All export fixtures were cleaned and Home is open. No photo was sent externally or additionally saved to Photos. **798 tests / 49 files**, TypeScript and contracts passed. See `EXPORT_RESTART_RECOVERY.md` for exact limits; 24 hours was simulated by changing the test hold's filename, not the system clock. Existing build warnings, Android and physical-device acceptance remain.

## 12:54 Toronto follow-up — reliable fitted disclosure export

The final beta Release/configuration build `output/ios-simulator-2026-09-09T16-49-34.710Z.log` passed and is installed. Built/installed JS SHA256: `72be3c6dc2ee98547c7afc6e78550df2a22b9a20cb89118d91fbb39f8325734d`. The actual JPEG was inspected at 4032 × 3024 with a fitted 80-character wide label after recovering from the explicit 81-character validation error. A subsequent no-label JPEG retained resolution; both share sheets were cancelled and named export files cleared. Source checks: 745 tests / 47 files, TypeScript and contracts passed. See `DISCLOSURE_RENDER_HARDENING.md` for the callback/reference changes, tests, earlier top-centre stress case and remaining native fault-injection/Android/physical-device gates. No photo sent externally, production change or listener.

## 12:33 Toronto follow-up — real full-resolution JPEG export

The beta Release/configuration build `output/ios-simulator-2026-09-09T16-23-56.015Z.log` passed and was installed; its JS SHA256 matches `a5f07b44a404a38772bfdd95fc204982afea5400a89a0cc43a36b6f214942823`. The explicitly labelled demo-only local-photo test passed two real 4032 × 3024 Photos saves, with default disclosure and with disclosure disabled. An alternate Georgia/top-left label was verified in the actual Share JPEG. The system share sheet opened and was cancelled without sending; temporary export files remained during sharing and were removed after cancellation. Source checks: 696 tests / 46 files, TypeScript and frozen contracts passed. See `NATIVE_JPEG_EXPORT_QA.md` for evidence and remaining long-label/render-failure/device/staging tests. Original stock photos remain unchanged; two test JPEGs were added only to this dedicated simulator. No live calls, network changes, Docker restart or new listener.

## 12:15 Toronto follow-up — batch reviews and file cleanup

The 12:11 beta Release/configuration build is now installed: `output/ios-simulator-2026-09-09T16-11-06.056Z.log`. Native two-photo Item removal reviews passed empty-mask rejection, distinct per-photo review state and PNGs, preserved selection on switching, invalidation after painting, replacement of only the changed photo's files, sample-only submission and visible Back. The actual PNGs were inspected at 2048×1536 and 2048×1367; leaving Batch left zero test mask files. Source suite: 687 tests / 45 files, TypeScript and contracts passed. Detailed evidence/limitations are in `BATCH_MASK_REVIEW.md`. No live upload, job, charge, network setting change or Docker restart occurred. Full-resolution JPEG/disclosure, sharing, custom-staging batch instructions and physical-device checks remain open.

## 12:03 Toronto follow-up — real mask PNG review

The owner's all-direction brush acceptance remains passed. A new native **Review selection** sheet now exercises the same exporter used by real job preparation without submitting a job. Native testing caught and corrected Retina-scaled output and blank output from a hidden 1×1 SVG renderer; both fixes are tracked in a pinned dependency patch. The build script now rejects stale CocoaPods package paths. See `NATIVE_MASK_REVIEW.md` for defects, cached Release dependency inputs and reproducible-build limits.

Corrected build `output/ios-simulator-2026-09-09T15-56-28.459Z.log` passed and was installed. Native binary SHA256 matched the built output: `5deb6d9504d0e0ec5dfc0d2ed47f3fc5d6350f4b00fd8157d290c16a5314cd17`. The stock flower photo exported at verified 2048×1536 with visible painted marks, matching photo-overlay alignment, separate region outputs, preservation after returning/reopening and correct removal of only Region 2's mark after Undo. Automated input produced points, so complete manually painted stroke shapes are not certified by this check. No file upload, paid generation, purchase or database call was made.

Mobile's full source checks passed at 11:55: 672 tests / 43 files, TypeScript and frozen contracts. Batch masks, large-shape export, slider interaction, full-resolution disclosure export, physical devices and staging still require acceptance. Previous build notes below are historical, not the currently installed binary.

## 11:28 Toronto follow-up — owner acceptance

After the fix was installed, the owner reported that brushing works perfectly right-to-left, up-to-down and **in all directions**. Directional mask drawing on the open Item removal photo therefore passes this human simulator check. The installed bundle was independently matched to the rebuilt output by SHA256 `1e82c8e334132c1b0e42e1444804df92dcc5ccc7f20204fa5557c196e8de949a`; all 11 mask/navigation tests passed again.

This does not certify mask export, batch masks, explicit Back/scroll restoration, brush-size slider behaviour, interrupted gestures, physical iPhone/Android or live processing. No live call or paid image generation was needed. The earlier automation limitation below is historical and must not be used to reopen the now-passed directional drawing test without new evidence.

Export follow-up source inspection: `Studio.submit()` currently returns through the demo-processing branch before `mask.current.export()`. Therefore, pressing **Preview the processing experience** is not a native PNG-export test. Do not switch to live mode to bypass this safety gate. A bounded local mask-review/export test path is the next native QA step, using the actual `MaskEditor` exporter without upload or generation. The existing hidden SVG renderers request exports at up to 2048 pixels; actual pixel dimensions and paint alignment still need native verification. The user's open editor was not cleared or submitted during this inspection.

## 10:50 Toronto follow-up — owner-reported brush conflict

The owner manually confirmed right-to-left painting, but left-to-right movement could invoke the iPhone's navigation swipe. Automated coordinate dragging also failed to move the native slider, so its failure is not reliable evidence that painting itself is broken. The owner had not separately certified the slider.

Implemented an editor-only fix: Studio and Batch disable native swipe dismissal while retaining their visible Back buttons. The mask owns an active stroke, pauses the containing page's scroll while painting, restores scrolling on release/cancellation/unmount, and lets touches reach the paint surface instead of its decorative image. Other routes retain their existing navigation gestures. The editor explains scrolling outside the photo and using Back.

Ten gesture-controller tests cover both horizontal directions, taps, cancellation, unmeasured layouts, invalid coordinates, bounds and scroll-release on commit failure; one AST wiring check verifies swipe protection is attached only to Studio/Batch. These are not native-touch certification. Full suite: **644 tests / 41 files**, TypeScript and frozen contracts passed.

The rebuilt beta Release demo passed with embedded configuration validation: `output/ios-simulator-2026-09-09T14-50-10.775Z.log`. It was installed and launched in the same dedicated simulator (process 17386). At about 10:53, the rebuilt demo banner, sample Home, Item removal, system photo picker and updated brush instructions were visibly checked; the Apple stock flower photo and slider were left open for the owner. An automated tap still did not visibly paint, so no automated gesture pass is claimed. Manual post-fix directional painting subsequently passed as recorded above. Scrolling after lifting, explicit Back, batch masks and actual mask export remain to be verified. See also `RESULT_EXPORT_LIFECYCLE.md` for the separate export cleanup fix included in this build.

Navigation reference: [Expo Stack gesture options](https://docs.expo.dev/router/advanced/stack/) documents `gestureEnabled` and `fullScreenGestureEnabled`. [React Native PanResponder](https://reactnative.dev/docs/panresponder) distinguishes voluntary responder termination from OS interruption.

## Build and installation

- Owner-selected Xcode: `/Users/alipashaamidi/Downloads/Xcode-beta.app`, 27.0 beta 6 / 27A5252f.
- Correct workspace, Furnio/Pods projects, Furnio scheme and Furnio Mobile QA destination were verified in the GUI.
- `DEVELOPER_DIR=/Users/alipashaamidi/Downloads/Xcode-beta.app/Contents/Developer node scripts/build-ios-simulator.mjs` passed. The build used the iOS 27.0 simulator SDK, Release, arm64, demo mode and no code signing.
- Full local log: `output/ios-simulator-2026-09-09T14-16-05.765Z.log`. Embedded Expo identity/configuration verification passed.
- Installed and launched `ai.furnio.app` in the dedicated iPhone 17 simulator, Furnio Mobile QA, UUID `890062D4-AB26-4389-94E5-043C1C95999D`, running the existing iOS 26.5 runtime (23F77).
- The global Xcode selection was not changed. No additional iOS runtime was downloaded, no Metro server was started and Docker remained stopped.

## Observed native behaviour

The newly built app visibly showed its **DEVELOPMENT DEMO / SAMPLE DATA / NO LIVE CALLS** banner. The following were inspected through the native Simulator UI:

1. Welcome and sample-app entry, real Furnio artwork, Home and bottom navigation.
2. Credits & plans, separate Apple management label, sample store-price explanation, monthly-plan selector and existing-subscription copy. No store management link or real purchase was opened.
3. Item-removal editor, system photo picker with selected-photo access, selection of an Apple simulator stock flower photo, native rendering of that selected image, and creation/selection of a second mask region.
4. Return to Home without a crash; the simulator was left on the sample dashboard.

**Historical automated-test limitation:** coordinate taps/drags did not produce a visible painted mask, and coordinate scrolling was unreliable, although accessibility-button activation and photo selection worked. The owner's subsequent human test confirmed a directional navigation conflict, which was fixed and then accepted as recorded above. Export and physical-device acceptance remain open. No painted mask was exported, photo uploaded, paid generation requested or draft saved during this automated test.

The application stayed running. Native logs contained UIKit focus, CoreUI theme and ImageIO framework diagnostics; dependency build warnings also remain. There is no claim of warning-free compilation or clean native logs.

## Separate regression evidence

`pnpm check` passed after restart: **625 tests in 38 files**, TypeScript and frozen customer API contracts. These are not substitutes for native gestures, full-resolution export, real authentication, SMS or sandbox purchases.

## Laptop prerequisites still missing

The exact Android packages `platforms/android-36`, `build-tools/36.0.0`, `cmdline-tools/latest` and `ndk/27.1.12297006` were absent when checked before this build. See `LAPTOP_SETUP.md` for SDK Manager steps. Apple/Google/RevenueCat/Expo accounts, an isolated staging backend, a mobile Git remote, signing and release approvals remain separate requirements.
