# iOS dependency recovery — 9 September 2026

## What changed

The earlier React Native 0.86.3 upstream 404 is no longer reproducible. All four default Maven URLs return HTTP200 after their normal HTTPS redirect to `repo.reactnative.dev`. Their published SHA-256 values match Furnio's existing archives exactly:

| Archive | SHA-256 |
| --- | --- |
| Core Debug | `95283572f0d46919c8e208811d7470eca174d47b6152505f205d805867f99e1f` |
| Core Release | `05359752100c0db4be9229423fc673eb3b981ba97aa6210707b878a708320a98` |
| Dependencies Debug | `fa019419384f6f859655fec80b2d20736bb0441bb911cb1944b91719322ae512` |
| Dependencies Release | `5e06070fdad3315f9f3020283d16875395f93e8a59e175be36d8971e64095892` |

Checks use the version and URL construction from the installed pinned React Native pod scripts, not an arbitrary mirror. TLS verification remained enabled. Only HTTP headers and small checksum files were requested for this check; no extra framework download was needed because the verified archives were already present.

Sources: the [official React Native precompiled iOS explanation](https://reactnative.dev/blog/2026/02/11/react-native-0.84#precompiled-binaries-on-ios-by-default), installed `scripts/cocoapods/rncore.rb` and `rndependencies.rb`, and the [versioned official artifact directory](https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/0.86.3/).

## Normal pod setup restored

An ordinary `pod install --no-repo-update` succeeded but retained the old local-file pod metadata. Inspection caught that; it was not counted as recovery. Updating **only** the two pinned pod specifications refreshed them correctly:

```sh
cd '/Users/alipashaamidi/Dev/Furnio Mobile/ios'
env -u RCT_TESTONLY_RNCORE_TARBALL_PATH -u RCT_USE_LOCAL_RN_DEP -u ENTERPRISE_REPOSITORY \
  DEVELOPER_DIR=/Users/alipashaamidi/Downloads/Xcode-beta.app/Contents/Developer \
  EXPO_PUBLIC_APP_MODE=demo \
  pod update React-Core-prebuilt ReactNativeDependencies --no-repo-update
```

Both local podspec snapshots now reference official HTTPS debug archives and include the upstream configuration-switching phases. Those scripts were inspected before running a build. **The complete installed pod version list is unchanged**, including React Native0.86.3 and Furnio's patched SVG15.15.4. No dependency upgrade or global CocoaPods/Xcode/network setting was changed.

The tracked local simulator build helper now rejects stale/local-file metadata, missing configuration phases and mismatched React Native versions before invoking Xcode. Its existing SVG source/path guards remain. This guard is specific to that helper; EAS/store builds need their own acceptance.

## Verification

- Official artifact availability and all four checksum comparisons: pass.
- Normal pod specification refresh and unchanged dependency versions: pass.
- New local Release build and embedded Furnio identity check: **pass**, log `output/ios-simulator-2026-09-09T22-08-17.383Z.log`. Both upstream framework configuration markers now read `Release`; both XCFramework signature checks pass.
- Installed that exact build into the existing dedicated **Furnio Mobile QA** simulator (not another simulator or a physical phone). It launches and visibly renders the sample-only welcome screen; evidence `output/ios-standard-pods-startup.png`. The installed executable and JS bundle match the build. JS SHA256 `e45a26944c3e40c80f9193205aeb9ebbe4c18f2bbe55186f664f747f4676beb4`. No paid call, new server or Metro port was needed. Earlier demo Home had no in-progress editor before replacement; local simulator data was not erased.

Known install diagnostics remain: optional Expo precompiled third-party bundles fall back to their source; React Native's space-containing-path discovery emits `find` warnings while the explicit Furnio `RCTNewArchEnabled` setting is present. They are not hidden or presented as fully resolved.

The successful beta-Xcode build logs four literal `error: the following command failed with exit code 0 but produced no further output` diagnostics adjacent to Swift compile steps (RevenueCat, ExpoRouter, ExpoUI and Furnio), and many dependency warnings. Xcode returned0 and produced a current runnable app, so this is a verified build/startup pass, **not a clean diagnostic log**. Two other `error:` text matches are Swift source parameter names, not diagnostics. Stable submission-toolchain/clean CI acceptance must independently investigate/revalidate the beta diagnostics; no warning suppression or compiler downgrade was applied.

This verifies recovery from the earlier missing-artifact workaround. It is **not** a clean-machine/CI install, signed physical-device/store archive, or staging/store acceptance. Those gates remain. The owner's paid staging approval is still pending. No additional laptop software is requested by this milestone.
