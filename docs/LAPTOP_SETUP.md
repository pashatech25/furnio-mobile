# Furnio Mobile — laptop setup

Checked locally on 9 September 2026; the four exact Android dependencies were rechecked at about 09:19 Toronto and are still missing. These are build prerequisites, not a request to replace your website or reset another project.

## Already installed — do not reinstall

- Apple Silicon Mac, about 182 GiB free after native dependency/build/simulator setup.
- Xcode 26.6, including the iOS 26.5 SDK. **Rechecked at 02:01 Toronto: the iOS 26.5 simulator runtime is now installed too.** Do not reinstall it.
- Android Studio, Java 17, CocoaPods 1.16.2, Node, pnpm 11.19.0 and Docker.
- Rechecked at 01:24 Toronto: Android platform `android-36.1`, Build-Tools `36.1.0` and `37.0.0`, Platform-Tools and Emulator are now installed. Keep them; no deletion or reinstall is needed. The app’s exact compile dependencies below are still missing.
- Other projects are using Docker/Supabase. Do not stop, reset or delete their containers.

**Restart handoff update:** the owner subsequently stopped Docker while troubleshooting connectivity. Do not restart it automatically. Browser/build/network testing is paused until the owner returns from the Mac restart; see `RESTART_HANDOFF.md`. The installed-software inventory does not mean its services are currently running.

## 1. iPhone simulator — now installed

The runtime installation is complete. A dedicated **Furnio Mobile QA** iPhone 17 simulator was created for this project (`890062D4-AB26-4389-94E5-043C1C95999D`). Furnio's native Release demo is built, installed and opening successfully there; dashboard/project/result/editor smoke checks passed. **You do not need to install anything else for this iOS simulator milestone.** Physical-device signing and store builds still require the accounts below.

For future reference only, if an additional runtime is needed:

1. Open **Xcode**.
2. Choose **Xcode → Settings → Components**.
3. Find the **iOS 26.5 simulator runtime** compatible with the installed Xcode and click **Get**. If it is not in the first list, use **Add Platforms** under **Other Installed Platforms**, select iOS 26.5, then **Download & Install**.
4. Let the download and installation finish. You do not need watchOS, tvOS or visionOS for Furnio.
5. Open **Window → Devices and Simulators → Simulators**. If no iPhone exists, click **+**, choose an iPhone and the installed iOS runtime, then **Create**.
6. Tell me when it is installed; I will rerun the native build and simulator checks.

The earlier empty runtime list caused the previous unavailable-destination build error; the latest inspection now lists iOS 26.5 (`23F77`). Apple's instructions use the Components settings: [Xcode components](https://developer.apple.com/documentation/Xcode/downloading-and-installing-additional-xcode-components) and [adding simulators](https://developer.apple.com/documentation/safari-developer-tools/adding-additional-simulators).

## 2. Install the Android SDK packages

1. Open **Android Studio**. Complete its initial setup wizard if prompted; do not import or alter another project's settings.
2. Open **Tools → SDK Manager**. From the welcome screen, use **More Actions → SDK Manager** if available.
3. Use this SDK location: `/Users/alipashaamidi/Library/Android/sdk`.
4. In **SDK Platforms**, select **Android 16 / API 36.0** (`platforms/android-36`, not only `android-36.1`). This is the compile/target API required by this app's installed React Native version. The newer platform already installed does not provide the `android-36` build directory.
5. In **SDK Tools**, enable **Show Package Details** and select:
   - Android SDK Build-Tools **36.0.0**
   - Android SDK Platform-Tools (already installed)
   - Android SDK Command-line Tools (latest)
   - Android Emulator (already installed)
   - NDK (Side by side) **27.1.12297006**
6. Click **Apply**, review the licences and complete the downloads. If the native build requests an additional CMake version, I will identify the exact version from the build rather than asking you to install arbitrary versions.
7. Open **Tools → Device Manager** and start an existing virtual phone. `Galaxy_S25_Ultra`, `Pixel_9_Pro_XL` and `Pixel_9_Pro_XL_2` are already listed, so do not create another just for this task. A compatible newer Android runtime can run the API-36-targeted app. No device was running in the latest `adb devices` check.
8. Tell me when finished. I will verify SDK paths, `adb`, build tools, licences and the native Android build without changing your other projects' Java settings.

These versions come from this project's installed `react-native/gradle/libs.versions.toml`, not a generic tutorial. Android's SDK Manager supports selecting exact package versions: [SDK Manager instructions](https://developer.android.com/studio/intro/update). Expo's emulator setup covers device creation: [Android Studio emulator](https://docs.expo.dev/workflow/android-studio-emulator/).

## 3. Accounts needed later — not missing laptop software

We can keep implementing and run local tests before these are ready. Do not paste private keys, recovery codes or passwords into chat.

- **Apple Developer membership** and access to App Store Connect, for signed device/TestFlight distribution and Apple purchase products. The account owner approves paid agreements and banking/tax details.
- **Google Play Console developer account**, payments profile and internal-test access. The owner approves agreements and prices.
- **RevenueCat account/project**, with Apple/Google connections and explicitly approved product mappings. Only public SDK keys go into the app; secret verification credentials belong to the backend.
- **Expo account/project** if using EAS cloud builds, signing or push delivery.
- **An isolated Furnio staging backend** (Supabase, API/Workers, storage and auth callbacks), separate from production. Existing unrelated local Supabase projects are not a substitute.
- **A separate Git remote for Furnio Mobile**; none is configured yet. Do not reuse the website or Admin remote.

I will open the relevant service when configuration is needed and let you sign in. No live payments, paid model tests, production flags or public submissions are authorised by installing these tools.

## Verification after installation

I will check simulator/device availability, run native iOS and Android builds, then exercise login, upload, masks, rendering, sharing and secure storage. Successful JavaScript exports are not a replacement for these native checks. Store purchases additionally require sandbox products and signed builds.
