# Native service inputs and reference placement

9 September 2026, Toronto. Mobile-only changes; no web, Admin, Worker, production, authentication or payment changes. No live image generation or upload was used.

## Implemented

- A shared local preflight validates the actual frozen request contract for all nine services before demo submission or live uploads. Required source/reference counts, project, source metadata, JPEG dimensions, file-size/name limits, multi-view anchor, exterior options, staging text, masks and reference placements have friendly errors.
- The real request builder binds the actual uploaded IDs and mask keys to the selected service. No master prompt, provider instruction, cost override or local file URI is sent. Server permission, prompts and pricing remain authoritative.
- Floor-plan PDFs are accepted only for that service. Metadata validation does not inspect PDF pages or certify their contents; server validation remains required.
- Adding reference photos appends up to five pieces, preserving existing placements. Removing a piece removes its matching pin and reindexes the remaining pieces together. A replacement room clears old placements.
- Each selected piece has visible placed/unplaced status, centre placement, accessible five-percent directional adjustments, coordinates, clear and remove actions. Finite, bounded positions are required for every piece. Duplicate detection is by selected URI, not by a hash of independently copied photo content.
- An uncertain ordinary job submission remains protected when selecting photos. This is not durable ordinary-job recovery across restart; that remains open.
- Turning disclosure off now bypasses invalid hidden label fields for unlabelled export. Re-enabling preserves the user's fields and validates them normally.

## Source verification

`pnpm check` passed at 13:37: **846 tests / 50 files**, TypeScript and frozen customer API contracts. Includes all nine valid forms, invalid file/text/geometry/options/anchor/reference/mask inputs, actual uploaded-ID bindings, append/remove/nudge behaviour and native-patch wiring. These are not real provider, native touch or account-switch acceptance tests.

## Native checks and crash investigation

The 13:26 beta Release/configuration build passed. In the dedicated Furnio iPhone simulator, the native reference editor passed empty-source rejection, stock-photo selection, adding multiple test references, centre/directional placement, append preservation, matching-pin removal and missing-placement rejection. Stock flower/waterfall photos were test surfaces, not claims of actual furniture results.

The final valid reference demo transition crashed at 13:31 while mounting result disclosure text. It is **not** an end-to-end pass. Crash `Furnio-2026-09-09-133114.ips` (incident `6D0F5311-0C8A-4BEA-8B02-CBAA76A4C3B4`) records main-thread glyph-context release failure while the JavaScript thread was in synchronous SVG `getBBox`. Installed native source dispatched only registry lookup to main, then mutated glyph/path state on the calling thread.

The pinned SVG 15.15.4 patch now serializes the entire bounds measurement with native drawing on the main thread. Registry lookup is main-thread-aware to avoid dispatching synchronously onto itself. Existing pixel-resolution fixes remain. CocoaPods was refreshed against the new physical patched dependency; a build guard rejects stale paths or a missing measurement patch. This is a narrow local fix, not an upstream upgrade or a claim that all SVG native methods are thread-safe.

The first thread-confined build (`output/ios-simulator-2026-09-09T17-38-13.111Z.log`) completed two reference-demo result transitions without a new crash. A subsequent 80-character Georgia/top-centre export safely failed with a measurement error. Native source shows that an offscreen view may never draw, while `getPath` alone does not populate fresh `fillBounds` and receives a null graphics context. A second narrow patch therefore performs a one-pixel root render before reading logical viewBox bounds. It reuses the existing viewport-restoring exporter, on the main thread, without a full-resolution allocation for measurement. The normal final JPEG still uses full resolution.

The final patched beta Release/configuration build `output/ios-simulator-2026-09-09T17-46-48.797Z.log` passed and was installed. Built/installed executable SHA256: `1a4614c839f613453dc452fc8f3ca00de98b7f3ac57fd20af1757b2c321b02d1`; JS SHA256: `25bf7b2b052aeae87cd5a122be9580d6c0c3aa86681ef9492e281fbd17616154`. The native measurement symbol was also verified in the compiled binary. Both beta builds returned success but logged a RevenueCat SwiftCompile diagnostic saying a command failed with exit code 0. Preserve that diagnostic rather than claiming clean compilation.

Final-build native export checks at 13:49–13:53:

1. Opened the project result and selected the unchanged Apple stock flower photo. Exported 80 `W` characters using Georgia/top-centre. The real JPEG was inspected: the full line fits inside the photo and dimensions remain **4032 × 3024**. The share sheet opened and was cancelled without choosing any recipient/app or saving to Photos.
2. Entered an invalid colour, turned disclosure off and exported successfully. The actual JPEG has no label and remains **4032 × 3024**. No disclosure PNG was allocated. Sharing was cancelled.
3. Re-enabled disclosure: the long text, Georgia/top-centre selection and invalid colour were preserved. Export rejected it with the six-digit-colour message. Correcting the colour restored valid settings.
4. Exercised all five font buttons and all six position buttons without a crash. This is update/mount evidence, not pixel certification for every font/position combination.
5. The exact export directory was empty after cancellation and validation rejection; only owned generated exports were removed by the app. Originals, existing picker caches and earlier Photos saves were not swept.
6. At 13:52, a bounded native log query found no new `getBBox`, invalid-SVG or null-graphics-context diagnostic after the final build. No new Furnio crash report appeared. Other known UIKit/CoreUI/ImageIO/haptics/ShareSheet and beta dependency diagnostics remain; no warning-free or crash-free release guarantee.

Source checks passed again at 13:53: **846 tests / 50 files**, TypeScript, contracts and `git diff --check`. At 13:55 the final-build reference flow also passed: source and reference selection, centre placement, right adjustment, demo processing, result rendering and visible Back. Returning preserved the 55%/50% pin. The simulator was left on Home, with the same app process alive. No real upload or service result was produced.

## Remaining gates

- Extended physical-device/crash stress acceptance remains. The earlier thread-only build passed two reference result mounts; the final build passed the reference round trip and long-label/no-label exports above. These finite checks do not prove no possible native crash.
- Native floor-plan selection, all service variations, full mask shapes and accessibility, physical iOS/Android and staging request/prompt parity remain.
- Review ordinary Studio async upload/submit lifetime and account-change fencing. Do not assume a component remount cancels asynchronous work or proves account isolation.
- Ordinary-job durable unknown-outcome recovery and broader picker/SDK cache ownership remain separate work.
- The complete approved app plan remains in progress; see `PROGRESS.md` and `LAPTOP_SETUP.md`.
