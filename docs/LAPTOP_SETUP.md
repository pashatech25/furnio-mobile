# Furnio Mobile — laptop setup

**18:12 Toronto update:** no extra laptop installation is needed. The earlier iOS React Native artifact404 has cleared; all four official checksums match, normal pod metadata is restored without dependency upgrades, and the resulting Release app builds and opens in Furnio Mobile QA. Read `IOS_DEPENDENCY_READINESS.md` for beta-Xcode diagnostics and remaining clean-CI/store limits. The old local-tarball workaround below is historical and should not be reapplied. This does not replace staging, store accounts, retention decisions or physical-device acceptance.

## Current status — Android build and native export verified, 9 September 17:26 Toronto

**No additional laptop software is needed for the verified Android emulator build.** The owner installed the tools, and we added the missing base `platforms/android-36` alongside `android-36-ext18`. The first build also installed its exact Build-Tools35.0.0 and CMake3.22.1 dependencies using existing SDK licence acceptance. Nothing was removed and no new licence prompt was accepted on the owner's behalf.

Furnio now builds, installs and opens on `Pixel_9_Pro_XL_2`. Native photo selection, style selection, confirmation and sample processing/result checks passed. An Android-only navigation spacing fix also passed the final native visual check. This is a self-contained, debug-key-signed **demo APK**, not a signed store release or live-backend acceptance. See [Android native QA](ANDROID_NATIVE_QA.md) for exact build evidence and remaining tests. The emulator remains open on Home; no Metro server is required.

The follow-up also passed two-region mask PNG review/Undo and real JPEG saves with and without disclosure, repeat export, Android native sharing/cancellation, and visibly distinct serif/monospace font equivalents. Android-specific decoder/graphics readiness bugs found during testing were corrected locally. Final **1,043 tests / 58 files**, TypeScript/contracts and APK build/signature/alignment checks pass. There is nothing else to install for this emulator milestone. Physical devices, store accounts, isolated staging and the remaining implementation/release gates are separate unfinished requirements.

The timestamped notes below are history; this current status supersedes their missing-SDK statements.

**Android setup resumed, 9 September 16:36 Toronto:** the owner completed SDK setup. Verification found `android-36-ext18` rather than the separate base platform. Added only `platforms/android-36` revision2 using the installed Android CLI and existing licence acceptance; no licence prompt was accepted on the owner's behalf. SDK inventory now confirms the base platform and all three previously missing tool components. Build-Tools `aapt` and NDK `clang` execute successfully with scoped Java17. Existing SDK versions were not removed. The first native Android build is in progress; installation alone is not build or emulator acceptance.

The existing `Pixel_9_Pro_XL_2` AVD has the installed Android36.1 ARM64 image and boots successfully. The other listed AVDs reference absent API30/37 images; leave their configuration unchanged. Furnio QA uses `_2` with `-read-only -no-snapshot-save`, so its temporary phone changes are not saved. No emulator wipe, host network change or new Furnio development server is needed.

**Latest inventory, 16:19 Toronto:** of the four formerly missing exact Android components, **only `platforms/android-36` remains missing**. Build-Tools36.0.0, latest command-line tools and NDK27.1.12297006 directories are now installed. These are directory checks, not yet Android build/licence acceptance. Install only Android16/API36.0 as described below; keep all existing versions and virtual devices. The 16:31 corrected iOS native photo/export/restart checks pass; see `PHOTO_INPUT_PRIVACY.md`. No extra iOS software is needed for this simulator milestone.

**15:50 Toronto checkpoint:** the owner-authorized isolated SQL suite now passes all23 mobile migrations, including automation deletion suppression/race tests. No additional laptop dependency was introduced. The new Automation Worker guard is disabled and needs later full-schema staging configuration, not a live secret now. Temporary Furnio containers were removed; leave the unrelated Docker stack alone until the owner answers its shutdown question. See `ACCOUNT_AUTOMATION_GUARD.md`.

Checked locally on 9 September 2026; the latest inventory above supersedes the earlier four-missing-package checkpoints. These are build prerequisites, not a request to replace your website or reset another project. No additional iOS software is needed for the current simulator work.

## Already installed — do not reinstall

- Apple Silicon Mac, about 182 GiB free after native dependency/build/simulator setup.
- Xcode 26.6, including the iOS 26.5 SDK. **Rechecked at 02:01 Toronto: the iOS 26.5 simulator runtime is now installed too.** Do not reinstall it.
- Android Studio, Java 17, CocoaPods 1.16.2, Node, pnpm 11.19.0 and Docker.
- Android platforms `android-36`, `android-36-ext18` and `android-36.1`; Build-Tools `35.0.0`, `36.0.0`, `36.1.0` and `37.0.0`; latest command-line tools, NDK `27.1.12297006`, CMake `3.22.1`, Platform-Tools and Emulator are installed. The actual Furnio ARM64 build passes with scoped Java17. Keep all versions; no deletion or reinstall is needed.
- Other projects are using Docker/Supabase. Do not stop, reset or delete their containers.

**Restart handoff update:** the owner subsequently stopped Docker while troubleshooting connectivity. Do not restart it automatically. The owner has now returned, confirmed Chrome works and asked to resume; bounded offline browser checks passed. The installed-software inventory does not mean its services are currently running.

**15:05 update:** the owner explicitly authorized starting Docker for the isolated database suite; all 22 mobile migrations and fixture tests now pass. Temporary test containers were removed. Docker automatically resumed the existing LiveBy-Rep Supabase stack and its published ports; the owner was informed. A separate question asks whether to quit Docker afterward—await the actual answer rather than stopping another project's containers by assumption.

**15:23 update:** Mobile/backend checks now pass 968 tests; privacy request abuse protection is documented in `ACCOUNT_PRIVACY_RATE_LIMITS.md`. Its independent Worker secret/bindings must be configured later in isolated staging; this is not another laptop installation and no live secret was requested or added. Final deletion is still disabled. Android's four missing components below remain the next laptop prerequisite. No Mobile Git remote is configured.

**Xcode beta clarification, updated 10:31 Toronto:** the owner wants to use the installed `/Users/alipashaamidi/Downloads/Xcode-beta.app` (27.0 beta 6, build 27A5252f), which opens successfully. The regular `/Applications/Xcode.app` GUI reported an OS-compatibility error on this Mac (macOS 27.0); its command-line tools still report 26.6. Do not replace either installation or change the global `xcode-select` setting. Select the beta for Furnio commands only with `DEVELOPER_DIR=/Users/alipashaamidi/Downloads/Xcode-beta.app/Contents/Developer`. A new beta Release simulator build, embedded configuration check, installation and demo startup now passed using the iOS 27.0 SDK and existing iOS 26.5 simulator. No additional iOS download is needed for this milestone. Native brush drawing/export remain open tests; see `IOS_BETA_QA.md`. In the beta GUI, open `/Users/alipashaamidi/Dev/Furnio Mobile/ios/Furnio.xcworkspace`, not either unrelated `MobileApp` recent project and not the `.xcodeproj` alone.

## 1. iPhone simulator — now installed

**Noon verification:** the owner accepted brushing in all directions. The subsequent corrected native build also passed limited two-region mask-PNG, alignment, return-to-editing and Undo checks. Larger painted-shape/batch/disclosure/physical-device tests remain; the earlier 10:31 open-test note above is historical. No extra iOS software is needed to continue these local checks.

**Native export build note:** the installed SVG library needs Furnio's tracked pixel-export patch and refreshed CocoaPods paths. `NATIVE_MASK_REVIEW.md` records a currently missing upstream React Native artifact and the verified, cached Release framework used for local simulator work. This does not require buying or installing another Xcode; clean store/CI builds still need reproducible dependency validation.

The runtime installation is complete. A dedicated **Furnio Mobile QA** iPhone 17 simulator was created for this project (`890062D4-AB26-4389-94E5-043C1C95999D`). Furnio's native Release demo is built, installed and opening successfully there; dashboard/project/result/editor smoke checks passed. **You do not need to install anything else for this iOS simulator milestone.** Physical-device signing and store builds still require the accounts below.

For future reference only, if an additional runtime is needed:

1. Open **Xcode**.
2. Choose **Xcode → Settings → Components**.
3. Find the **iOS 26.5 simulator runtime** compatible with the installed Xcode and click **Get**. If it is not in the first list, use **Add Platforms** under **Other Installed Platforms**, select iOS 26.5, then **Download & Install**.
4. Let the download and installation finish. You do not need watchOS, tvOS or visionOS for Furnio.
5. Open **Window → Devices and Simulators → Simulators**. If no iPhone exists, click **+**, choose an iPhone and the installed iOS runtime, then **Create**.
6. Tell me when it is installed; I will rerun the native build and simulator checks.

The earlier empty runtime list caused the previous unavailable-destination build error; the latest inspection now lists iOS 26.5 (`23F77`). Apple's instructions use the Components settings: [Xcode components](https://developer.apple.com/documentation/Xcode/downloading-and-installing-additional-xcode-components) and [adding simulators](https://developer.apple.com/documentation/safari-developer-tools/adding-additional-simulators).

## 2. Android setup — complete for local emulator testing

Use the existing **Pixel_9_Pro_XL_2** virtual phone, which has an installed Android36.1 ARM64 image. The other two listed AVDs refer to absent images and were left unchanged. Do not create or wipe another phone just for this milestone.

The following earlier installation checklist is retained for reference only; **do not repeat these downloads**:

1. Open **Android Studio**. Complete its initial setup wizard if prompted; do not import or alter another project's settings.
2. Open **Tools → SDK Manager**. From the welcome screen, use **More Actions → SDK Manager** if available.
3. Use this SDK location: `/Users/alipashaamidi/Library/Android/sdk`.
4. In **SDK Platforms**, select **Android 16 / API 36.0** (`platforms/android-36`, not only `android-36.1`). This is the compile/target API required by this app's installed React Native version. The newer platform already installed does not provide the `android-36` build directory.
5. Leave the existing SDK Tools installed. Build-Tools **36.0.0**, latest command-line tools, NDK **27.1.12297006**, Platform-Tools and Emulator are already present; no repeat download was requested. If SDK Manager reports an incomplete installation, share that message so we can identify the exact component.
6. Click **Apply**, review the licences and complete the downloads. If the native build requests an additional CMake version, I will identify the exact version from the build rather than asking you to install arbitrary versions.
7. Open **Tools → Device Manager** and start an existing virtual phone. `Galaxy_S25_Ultra`, `Pixel_9_Pro_XL` and `Pixel_9_Pro_XL_2` are already listed, so do not create another just for this task. A compatible newer Android runtime can run the API-36-targeted app. No device was running in the latest `adb devices` check.
8. Tell me when finished. I will verify SDK paths, `adb`, build tools, licences and the native Android build without changing your other projects' Java settings.

These versions come from this project's installed `react-native/gradle/libs.versions.toml`, not a generic tutorial. Android's SDK Manager supports selecting exact package versions: [SDK Manager instructions](https://developer.android.com/studio/intro/update). Expo's emulator setup covers device creation: [Android Studio emulator](https://docs.expo.dev/workflow/android-studio-emulator/).

## 3. Accounts needed later — not missing laptop software

We can keep implementing and run local tests before these are ready. Do not paste private keys, recovery codes or passwords into chat.

- **Apple Developer membership is active**, Xcode account verified, team `5SY24C9RBH`. Furnio App Store listing `6810452958` exists. Signing certificates/profiles and store builds remain; no Apple purchase products are planned for v1. See `STORE_SUBMISSION_STATUS.md`.
- **Google Play Console account and Furnio draft are created**. Internal/closed testing and signed bundle remain; production access requires the Console's 12 testers/14 continuous days. No in-app products are planned.
- **RevenueCat is no longer a v1 requirement** following the owner's website-only purchase decision. Do not resume its app/product setup.
- **Expo account/project** if using EAS cloud builds, signing or push delivery.
- **Isolated Furnio staging exists**, Supabase `bcrobmrimzkvfrnqarmv` and two read-only staging Workers. Storage/imaging/OAuth/SMS and remaining service acceptance need completion; do not create another project or reuse production. See `STAGING_INTEGRATION.md`.
- **A separate Git remote for Furnio Mobile**; none is configured yet. Do not reuse the website or Admin remote.

I will open the relevant service when configuration is needed and let you sign in. No live payments, paid model tests, production flags or public submissions are authorised by installing these tools.

## Verification after installation

I will check simulator/device availability, run native iOS and Android builds, then exercise login, upload, masks, rendering, sharing and secure storage. Successful JavaScript exports are not a replacement for these native checks. Store purchases additionally require sandbox products and signed builds.
