# Native JPEG and disclosure export — 9 September 2026

Local iPhone simulator evidence only. This is not physical-device, Android, authorized cloud-download or store certification. No AI job, purchase, live account or backend was used.

**Later follow-up:** the renderer fault-path hardening and long-label fitting listed below have since been implemented with bounded tests and additional native checks. See `DISCLOSURE_RENDER_HARDENING.md` for the 12:54 checkpoint; historical checks and remaining physical-device/staging scope here remain valid.

## Safe local test entry

The native result screen has a clearly labelled **LOCAL EXPORT TEST · DEMO ONLY** card in the compiled demo configuration. Selecting a device photo replaces the sample preview and identifies its real dimensions; it is never described as an AI result. Save/Share each require a Furnio confirmation explaining the real local side effect.

The selected photo uses the existing picker/normalization path. Only a local `file:` URI is accepted by the demo export helper; remote/hosted/file-query/data URLs and use outside demo mode are rejected. The source photo is not registered for deletion. After source selection, the same disclosure renderer, JPEG exporter, Photos save, native sharing and owned-file cleanup code are used as normal results. Production clean-download authorization and trial-locked output checks remain in place. No query parameter enables demo mode.

## Verified at 12:26–12:33 Toronto

Build: `output/ios-simulator-2026-09-09T16-23-56.015Z.log`, beta Xcode Release simulator build and embedded configuration validation passed. The installed and built JS bundle hashes both equal `a5f07b44a404a38772bfdd95fc204982afea5400a89a0cc43a36b6f214942823`.

Device: existing **Furnio Mobile QA**, iPhone 17, iOS 26.5, UUID `890062D4-AB26-4389-94E5-043C1C95999D`. No Metro/listener or network-setting change was needed.

| Native check | Observed result |
| --- | --- |
| Select the simulator's stock flower photo | Test card reports 4032 × 3024; native preview displays the selected photo |
| Save with default disclosure | Add-Photos-only permission allowed in this dedicated simulator; Furnio success modal appears |
| Inspect actual saved `IMG_0007.JPG` | JPEG, 4032 × 3024, correct photo and white Arial “Virtually Staged” at bottom right |
| Change font and position, then Share | Georgia and top left selected; the actual exported JPEG reflects both changes at 4032 × 3024 |
| Inspect system share sheet | Real JPEG thumbnail/type/size visible; no recipient or destination app selected |
| Retain file while sharing | Final JPEG and intermediate disclosure PNG exist while the system sheet is open |
| Cancel sharing | Returned to usable result controls; named final JPEG and disclosure PNG cache files are gone |
| Disable disclosure and save again | Actual `IMG_0008.JPG` is 4032 × 3024 with no disclosure, and the success modal appears |
| Cleanup after both saves | No `Furnio-*` or `furnio-label-*` top-level cache files remain |

The two new JPEGs remain in the dedicated simulator's Photos library as test evidence. No original was overwritten or deleted. No photo was sent to another app/person. Inspection used the actual exported files, not the screen preview.

Source verification: **696 tests / 46 files**, TypeScript and frozen contracts passed. Nine added URI tests cover the local demo boundary. `git diff --check` passed. An earlier build was deliberately cancelled while correcting a missing `Label` import; the subsequent checks and named build above passed.

## Remaining gates

- Physical iPhone/Android, portrait/rotated/very large photos, all positions/fonts/colors, long text and dynamic type.
- Long disclosure fitting currently needs parity review against the website's measured-width shrink-to-fit behaviour. These short-label exports do not establish that long labels fit.
- Renderer callback timeout/unmount/stale-callback handling, synchronous native capture errors and programmatic full-resolution validation need further hardening/fault tests. Normal export success is not fault-path certification.
- Permission denial, low disk, backgrounding, interrupted render/share and a real receiving app remain untested.
- The cleanup observation covers the named files and session-owned handles. It does not certify SDK-internal orphan files, picker copies or crash/restart sanitation; see `RESULT_EXPORT_LIFECYCLE.md`.
- Authorized server download, trial protection and actual cloud results require isolated staging acceptance. Do not enable production or run a paid image job to bypass that gate.

Android's four exact SDK dependencies were rechecked at 12:33 Toronto and remain absent; see `LAPTOP_SETUP.md`. This milestone changes only Mobile source/docs, not website, Admin, Workers, billing or database state.
