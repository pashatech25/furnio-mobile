# Native result export — temporary-file failure handling

Implemented locally on 9 September 2026. No customer API, website, billing, authentication or processing Worker changed.

**13:15 follow-up:** `EXPORT_RESTART_RECOVERY.md` adds a durable native-session wrapper, owned folders/SDK markers, interrupted-share retention and startup/foreground recovery. Its 53 added checks and bounded native restart/fault-injection QA passed. The in-memory session below remains its normal-operation cleanup layer. Broader SDK-before-return, historical/picker/batch caches and physical-device closeout are not fully covered.

**12:54 follow-up:** `DISCLOSURE_RENDER_HARDENING.md` records per-render cancellation/readiness, late callbacks, native image-reference lifetime and exact-resolution checks. The export session described here still owns filesystem cleanup, including waiting for an active native share.

The result screen previously deleted its input/output copies sequentially inside `finally`, before clearing the busy state. A deletion failure could skip the remaining copy, replace the original export error and leave Save/Share busy. The disclosure renderer had the same sequential-cleanup problem and registered its PNG after writing, missing a partially failed write.

## Current behaviour

- One synchronous export-session lock prevents overlapping Save/Share work before React state updates.
- Only handles created for that export are registered. Download, disclosure PNG and final JPEG destinations are registered before writing/copying. ImageManipulator's generated copies are registered when the SDK returns their paths.
- The session tries every registered cleanup independently after success, failure or an interrupted screen. A native share retains its file until the share promise completes; an unmount must not delete a file still being shared.
- Cleanup failures do not replace the primary error or turn an already successful save into a claimed failure. The busy state is released.
- Remaining handles stay in this result-screen session for a visible **Retry temporary-file cleanup** action. A new export first retries cleanup and is blocked if copies still cannot be cleared, avoiding unbounded accumulation in that session.
- Missing files are already clean. Failed existence checks, throwing deletes and silently unsuccessful deletes remain pending; no file paths are shown by the cleanup warning.
- Originals in Photos/Files, saved drafts, cloud results, purchase receipts and other cache directories are not registered or deleted.

## Boundaries and evidence

Eight dependency-free fault-injection tests cover success, primary-error preservation, cleanup retry, partial writes, duplicate/missing handles, overlapping operations, unmount-time cleanup during sharing, throwing existence checks and silent deletion failure. The full suite passes **644 tests across 41 files**, TypeScript and frozen API contracts.

The original handle set is in memory; its new durable wrapper now covers allocated result destinations and registered SDK copies surviving a killed app. This is still **not complete device-cache sanitation**: SDK files created before their path is returned, picker/batch copies and historical orphaned files need separate ownership/policy work and physical-device acceptance. No whole-cache wipe was added. Low-disk/locked-device behaviour and complete device/staging tests remain open. The demo does not download sample result images.

At 12:33 Toronto, the added explicitly confirmed local-photo test passed real 4032 × 3024 JPEG saves with/without disclosure, alternate font/position, native share-sheet opening/cancellation and named-file cleanup. The export file was observed to remain while the share sheet was open and disappear afterward. No recipient was selected. See `NATIVE_JPEG_EXPORT_QA.md`; these normal-path simulator observations do not replace failure, crash or physical-device acceptance.

Reference: [Expo ImageManipulator](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/) documents saving manipulated images to cache. This implementation only owns returned generated files, not source originals.
