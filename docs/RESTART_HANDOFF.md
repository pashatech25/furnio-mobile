# Furnio Mobile — restart handoff

Saved 9 September 2026, Toronto, before the owner's requested Mac restart.

## Pause and resume

The owner asked to save the work, restart the Mac and resume after returning. Do not restart the computer, Docker, browser sessions, development servers or builds on their behalf. Do not change DNS, proxy, firewall or TCP settings. Wait for the owner to return before resuming implementation/testing.

The full approved mobile plan remains in progress, not completed or ready for customers. Read `PROGRESS.md`, `IMPLEMENTATION_PLAN.md` if present, `API_CONTRACT.md` and the relevant milestone documents before continuing; inspect the actual repository state rather than assuming the earlier environment survived the restart.

## Saved source

- Mobile: `/Users/alipashaamidi/Dev/Furnio Mobile`, branch `codex/mobile-foundation`. A local initial checkpoint is being saved with this handoff; verify its hash with `git log -1`. No Git remote is configured and nothing was pushed.
- Main: `/Users/alipashaamidi/Dev/AI Virtual Staging`, origin `https://github.com/pashatech25/furnio-main.git`, existing HEAD `19908507ecb032abaa38b07df49648e677dd880c`. Mobile compatibility source and twenty new migration files are saved on disk but remain uncommitted alongside unrelated reference-furniture/upload work. Do not reset, stash, commit wholesale or discard those edits.
- Admin: `/Users/alipashaamidi/Dev/Furnio Admin`, origin `https://github.com/pashatech25/furnio-admin.git`, existing HEAD `f9d6e913532ce36f75ddc6c627ab0b0f8eb84e65`. Native customer/reporting compatibility source is saved on disk but remains uncommitted. Preserve the unrelated `.codex-tmp/` directory.
- The Mobile initial candidate set was checked for common private-key/token signatures and credential-like filenames; no matches were found. Environment examples contain empty credential placeholders and disabled gates. This narrow check is not a comprehensive security audit.
- Generated native projects, dependencies, logs and screenshots are ignored by Git and remain on disk. A local commit is not an off-machine backup.

No production migration, push, Worker deployment, paid image request, real purchase or store submission was performed during this save operation. All native rollout flags remain disabled.

## Last verified implementation state

- Latest feature: separately gated native Admin reporting, with provider/currency-separated exact amounts, recorded subscription states and paginated follow-up; see `NATIVE_ADMIN_REPORTING.md`.
- Last completed checks before the connectivity interruption: 625 Mobile/backend tests across 38 files; 82 Admin tests across 14 files; Mobile/Admin TypeScript; frozen contracts; targeted Admin lint/build; isolated SQL/concurrency tests for twenty unapplied migrations. The account inventory covers 122 tables. These tests were not rerun during checkpoint saving.
- Latest installed iOS simulator Release build: `output/ios-simulator-2026-09-09T12-57-11.958Z.log`. The demo welcome screen was inspected; physical-device, authenticated staging and store testing remain open.
- Dedicated simulator: Furnio Mobile QA, UUID `890062D4-AB26-4389-94E5-043C1C95999D`, bundle `ai.furnio.app`. Recheck its state after restarting.
- The new Admin reporting panel's desktop/mobile visual and interaction acceptance is still pending. Its generated offline fixture is not proof of passing browser QA.
- No own test/build process was intentionally left running. The temporary preview server on port 4387 and the task's named Playwright browser were closed. Pre-existing port 4381 and unrelated browser/dev processes were not stopped by this task.

## Connection interruption findings

The owner reported Chrome `ERR_ADDRESS_INVALID` even after switching to a phone hotspot; Firefox still worked. Read-only checks around 09:46–09:49 found:

- The hotspot's IPv6 path could load `https://realviu.com/` successfully (HTTP 200 after redirects).
- Default IPv4 connection attempts failed immediately with “Can't assign requested address.”
- The same IPv4 request succeeded (HTTP 200) when this one diagnostic request used a free source port in 41011–41015. This did not create a listening server or change system settings.
- Approximately 16,000 lingering IPv4 `TIME_WAIT` sockets still referenced the old Wi-Fi address. These are closed-connection records, not 16,000 listening servers.
- Nothing was listening on TCP port 16000 in the check. This is a current snapshot, not proof of historical ownership.
- Evidence strongly points to temporary local IPv4 port exhaustion. It does not establish why the buildup occurred or prove an attack. Earlier process counts included Docker, Codex, Firefox and Chrome; attribution to a process cannot identify which particular Codex conversation caused traffic.
- The owner stopped Docker. Do not restart it automatically. Do not change system TCP limits or clear Chrome profiles/passwords as a workaround.

After the owner returns, first ask whether Chrome works after restart; use only bounded checks if further diagnosis is needed. Do not resume repeated browser/network testing while the connection is still failing.

## What the laptop still needs

The latest directory checks found these four exact Android prerequisites absent under `/Users/alipashaamidi/Library/Android/sdk`:

1. `platforms/android-36` (Android API 36.0, not only 36.1).
2. `build-tools/36.0.0`.
3. `cmdline-tools/latest`.
4. `ndk/27.1.12297006`.

See `LAPTOP_SETUP.md` for the Android Studio click-by-click instructions. Recheck before requesting installation again. Xcode/iOS runtime, Java, CocoaPods, Node, pnpm and Android Studio are already installed.

Separate account/configuration requirements remain: isolated staging, a new Mobile Git remote, Apple Developer/App Store Connect, Google Play, RevenueCat, Expo where needed, approved product prices/agreements/privacy and physical-device acceptance. Never reuse production or unrelated Docker projects to bypass these gates.

## Remaining scope — do not declare completion

Complete shared-account deletion and provider/session revocation; native Action Centre and automation compatibility; unresolved purchase/reconciliation cases; real staging authentication/SMS/all-nine-service prompt parity and regression tests; Android binaries; real sandbox commerce; push credentials/device testing; privacy/signing/private builds; and owner-approved store release remain. `PROGRESS.md` records the detailed boundaries. Native purchases and final account deletion must stay disabled until their full release gates pass.
