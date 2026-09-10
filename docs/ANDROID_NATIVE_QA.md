# Android native build and demo QA

## Latest — real staging authentication acceptance, 9 September evening

These checks use the existing staging Release APK SHA256 `7116bc6c3821b03ded45a449acf0dba4ace4636c0b1c48d61ffc3fc2ca9ed504`, log `output/android-emulator-2026-09-09T23-46-43.645Z.log`. ADB controls were explicitly authorized for **emulator-5554 only**. Credentials were read directly from the protected synthetic fixture and not printed. Supabase skill guidance kept the check isolated from production accounts and service credentials.

| Check | Observed outcome / local evidence |
| --- | --- |
| Owner sign-in | Real staging Home: 20 credits, View credits, correct synthetic project (`android-staging-login-result.png`) |
| Wallet | 20 shared credits, no native purchase controls, empty purchase history for the admin grant (`android-staging-wallet-current.png`) |
| Force-stop/relaunch | Session recovered with correct account balance and project (`android-staging-cold-start.png`) |
| Project detail | Correct Synthetic mobile staging QA project, 100 Test Street, Toronto, ON, Canada, 0/5 source photos (`android-staging-project-detail.png`) |
| Sign out | Branded confirmation (`android-staging-signout-dialog.png`), then cleared sign-in form (`android-staging-signout-verified.png`) |
| Second account | Signed in as synthetic other account: 20 credits and Create your first project (`android-staging-other-home.png`) |
| Project isolation after switching | Unfiltered Projects says No matching projects yet; previous owner's project absent (`android-staging-other-projects.png`) |

All evidence filenames are under ignored `output/`. The earlier `android-staging-signed-out.png` captured an intermediate screen, **not** the final sign-out outcome; use the verified screenshot instead. Device remains on the second account's Projects screen. No account creation, real SMS/email, FAL generation, charge, production mutation, new build or network-setting change. These bounded tests do not prove physical-device/OAuth/SMS/all-service/deletion/push acceptance.

Website-only purchases supersede old native-commerce gates in the historical notes below; use `WEB_PURCHASES_DECISION.md` and `STORE_SUBMISSION_STATUS.md` for current scope.

## Earlier demo milestone

Updated 9 September 2026, 17:26 Toronto. This closes the laptop prerequisite/first Android build and bounded mask/JPEG checks, **not** the complete app implementation or release gates.

## Toolchain and isolation

- SDK: `/Users/alipashaamidi/Library/Android/sdk`; base platform36 revision2 is now installed alongside36-ext18 and36.1. Extension platforms did not supply the required base directory.
- Build-Tools36.0.0, latest command-line tools23.0.0 and NDK27.1.12297006 were supplied by the owner. Build-Tools35.0.0 and CMake3.22.1 were then installed by the native build as exact library dependencies, using already accepted SDK licences. No new licence prompt was accepted for the owner.
- Scoped Java17: `/opt/homebrew/Cellar/openjdk@17/17.0.18/libexec/openjdk.jdk/Contents/Home`. No global Java/Xcode/network settings changed; no old SDK versions removed. The installed SDK wrapper also downloaded its Android CLI on first invocation; subsequent native CLI commands explicitly disabled metrics.
- Gradle9.3.1; ARM64 Hermes bundle; generated native project kept separate from the website. `scripts/build-android-emulator.mjs` strips inherited `EXPO_PUBLIC_` values, disables dotenv and explicitly selects demo mode. No Metro server, staging identity, paid model request, real purchase or customer upload was used.
- Existing `Pixel_9_Pro_XL_2`, Android16/API36 image36.1, ARM64, 1344×2992 at480dpi. Started with `-read-only -no-snapshot-save`; temporary device changes are not saved. Other AVDs pointing to missing API30/37 images were untouched. Standard emulator/ADB loopback services are in use; no host firewall/DNS changes were made.

## Builds

| Build                       | Evidence                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial native build        | `output/android-emulator-2026-09-09T20-37-42.605Z.log`; Gradle success in7m57s; APK SHA256 `ef314df113933353fcccea0ac80eb7404959e8258e4ce5a4f1a1fa280e374208` |
| Final navigation correction | `output/android-emulator-2026-09-09T20-48-11.358Z.log`; Gradle success in33s; APK SHA256 `59b4610a65ff29ba98f2fa393929be47fe8de296082dae18d29e1d734a775c87`   |

APK: `android/app/build/outputs/apk/release/app-release.apk`, package `ai.furnio.app`. These are **debug-key-signed Release/demo APKs**, not Play-signed production artifacts. Manifest identity, embedded JavaScript bundle, APK signature and `zipalign -c -P 16 4` checks passed. The final APK replaced only our first demo installation and cold-started in363ms. Native process6111 remained alive; bounded process-filtered AndroidRuntime/ReactNativeJS logs contained startup and no crash.

Build logs still contain SDK XML-version and dependency/deprecation warnings. They are not being described as warning-free. ZIP alignment passing is **not** a 16KB-runtime pass: this emulator reports4096-byte pages. Physical-device, 16KB-page runtime, clean CI and signed-store builds remain unverified.

## Native interaction evidence

On the initial build:

1. Welcome and **Explore sample app** opened Home with an explicit sample-data/no-live-calls banner.
2. Create showed the nine-service selection; Virtual staging opened its actual Studio controls.
3. Seeded only the bundled960×640 `assets/before.jpg` into the temporary emulator as `Pictures/Furnio-QA-20260909-before.jpg`. The Android system picker explicitly limited access to selected photos; no broad media permission was requested in this flow.
4. Selected the photo and confirmed its room image rendered in Studio. Choosing Modern updated the style input.
5. **Preview the processing experience** opened the app's confirmation modal with explicit no-upload/no-credit-spend wording.
6. **Run demo** displayed sample processing and then a succeeded result with before/after and disclosure controls. This was simulated processing, not an AI-quality or server-parity test.

The initial tab bar exposed a real Android-specific defect: its42px Create tile overlapped the label, and the bottom padding ignored the system gesture inset. The correction reserves the icon height, keeps labels below icons and applies Android safe-area height/padding in `app/(tabs)/_layout.tsx`; iOS options are unchanged. TypeScript passed after the edit.

On the final rebuilt APK, Welcome → sample Home and the actual native layout/screenshot confirmed separate icon/label space and gesture clearance. Full tab target bounds were215px high on this3×-density phone; labels ended at2890px, above the2920px tab bounds and system gesture area. Screenshot: `output/android-furnio-home-final.png`. The preceding photo/result test is attributed to the initial build; it was not unnecessarily repeated after a navigation-only change.

Additional local screenshots: `output/android-furnio-welcome.png`, `output/android-furnio-home.png`, `output/android-furnio-selected-photo.png`. Generated evidence and APKs are ignored outputs, not committed source or an off-machine backup.

## Open gates

- Broader Android mask/batch/stress tests, large-photo export, interruption/restart/privacy cleanup, accessibility, keyboard and phone/tablet tests. The bounded mask/export checks below now pass. Android cache filesystem cleanup was not independently inspected in this non-debuggable APK; do not infer it from iOS checks.
- Real staging login/Google/SMS, account switching, all nine service contracts and prompt parity, uploads, failures and shared-credit regression tests.
- Apple/Google/RevenueCat configuration, signed sandbox purchases, native reconciliation/refunds, physical devices and push delivery.
- Complete disabled account-deletion workflow and an owner-approved payment/backup retention schedule; the supplied website policies do not define those periods.
- Remaining website/Admin native compatibility, staging migrations, release/privacy approvals and store submission. No live changes were made here; existing flags remain disabled.

The emulator is left open on Furnio's sample Home for the owner. Only its temporary session and single bundled QA photo were used; no other project's Docker services or virtual devices were stopped or modified. Mobile has no remote; this work was saved locally, not pushed.

## Android mask and repeated-export follow-up, 9 September

This is native local-file QA using only the bundled 960×640 room photo, not a live processing or upload test. The earlier Home/checkpoint statement describes the preceding milestone.

### Failures reproduced and corrections

1. **Mask preview:** drawing succeeded, but Review selection failed with “The exported mask could not be opened.” Installed React Native 0.86.3's Android `Image.getSize` uses Fresco's encoded-image path, which does not decode data URIs. Android now checks the actual PNG using the existing Expo ImageManipulator native decoder, without writing a file. Both context/image references are released even after failure or late completion; the existing size/type/dimension/deadline guards remain. iOS retains its accepted decoder.
2. **Repeated disclosure export:** the first default JPEG saved, but changed settings exposed empty text bounds and then a renderer timeout. Installed SVG 15.15.4's Android `getBBox` assumed pre-rendered text and read mutable glyph state on the bridge thread. Its cached image path also omitted `onLoad`. The existing version-pinned patch now serializes measurement on the UI thread with a bounded 250ms wait, prepares missing glyph paths with a recycled 1×1 bitmap, and reports image readiness for cached as well as freshly loaded sources, once per current URI. Stale-source/null bitmap/absent-dispatcher guards remain. Existing iOS patch hunks are preserved. No dependency upgrade or global image-cache clearing.
3. **Font substitution:** inspecting the actual exported JPEG showed Georgia silently rendered as sans-serif. Android does not bundle those proprietary font families. The UI now explains its explicit system equivalents: Arial/Helvetica → sans-serif, Georgia/Times New Roman → serif, Courier New → monospace. iOS/web font-family values are unchanged. Shared buttons also retain their accessible title after loading, instead of Android exposing only “busy.”

### Native evidence so far

- Mask-fix APK SHA256 `cad9acfc8387a4772b9923ffbfea377e448c97004fe9320037a17d5becc56731`; build log `output/android-emulator-2026-09-09T21-01-45.284Z.log`.
- Painted one horizontal 52px region and another vertical 113px region. Review opened actual 960×640 PNGs and two painted regions. Region1 overlay aligned with the stroke; Region2 black/white export showed the distinct vertical white selection. Editing and Undo removed only Region2; Region1 remained reviewable. Explicit/Android Back returned to Create. No job submitted. Evidence: `android-mask-fixed-review.png`, `android-mask-fixed-binary.png` in ignored `output/`.
- SVG-readiness APK SHA256 `e302711aa515895f2160fdcbc927dd0bfb23a7ca351372353e233a85b0830382`; build log `output/android-emulator-2026-09-09T21-15-35.471Z.log`. Package, embedded bundle, signature and 16KB ZIP-alignment checks passed; the emulator itself still uses 4KB pages.
- Saved a real new 960×640 JPEG with top-left disclosure, then changed the font and opened the actual Android native share sheet for a second export of the same source. Cancelled without selecting a recipient or sending externally. The warm-cache timeout is resolved in this check. `output/android-native-share-fixed.png` records the real share sheet; `android-native-share.png` records the earlier failure and must not be used as passing evidence.
- `output/android-export-georgia-top-left.jpg` is the pre-font-mapping result: its position/dimensions passed, but its sans-serif substitution prompted the third correction. It is **not** proof that Georgia/serif styling passed.

### Final installed build and acceptance

- Log `output/android-emulator-2026-09-09T21-20-36.780Z.log`: **BUILD SUCCESSFUL in 29s**. APK SHA256 `10e394e8f3bc484633155034cecea7b9e7d375780fb77f9a3fbe09c62982722e`. The package/bundle/signature/16KB ZIP-alignment checks passed again for this artifact; it remains debug-key signed, not a Play release.
- Chose the original bundled photo again, not an earlier labelled export. Selected Georgia's explicit Android serif equivalent, top-left, size72. Saved and inspected the actual new JPEG: **960×640**, visibly serif, intact photograph, no clipping. Evidence: `output/android-export-serif-final.jpg`.
- Without replacing the input, changed to Courier New's monospace equivalent and top-centre, then exported again. Native Android sharing opened with the actual monospace label centred above the photo. Screenshot: `output/android-share-monospace-final.png`. Cancelled; no recipient, Print, Quick Share or external app was selected.
- Disabled disclosure and saved once more after cancelling sharing. Inspected the actual new **960×640 JPEG with no label**: `output/android-export-no-label-final.jpg`. The original remained unchanged. Four test-created JPEGs now exist in the temporary emulator's Photos library, including the earlier two diagnostic exports; none was deleted.
- Returned to sample Home. Final app process9961 was alive at17:26; resolve fresh before future use. This does not certify Android private-cache filesystem cleanup, long-label/large-image stress or real device compatibility. The UI remained usable after save/share cancellation and buttons retained their accessible names.

Final source checks pass **1,043 tests / 58 files**, TypeScript and frozen API contracts. Structural library-patch tests verify the patch is installed; they do not replace the native checks above. No production flags, SQL, Workers, shared web/Admin code, Docker or network settings were changed. Debug-key demo signing and all staging/store/device/retention gates remain as stated above. No build/Metro server remains running; the temporary emulator stays open for the owner.
