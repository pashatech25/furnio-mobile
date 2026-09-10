# Result export recovery after interruption

Implemented and checked locally on 9 September 2026, about 13:15 Toronto. This extends `RESULT_EXPORT_LIFECYCLE.md`; it is not complete device erasure, production acceptance or a change to website authentication/processing.

## Behaviour

- Each native result export creates a random session inside `Library/Caches/furnio-result-exports-v1` (the platform's current cache directory on Android). Allocated download, label PNG and final JPEG destinations stay in that session. The folder exists before a destination is handed to a writer, so an interrupted/partial write remains discoverable after restart.
- Returned ImageManipulator JPEGs remain in the SDK cache, with an empty ownership marker in the session. The marker stores only the SDK-generated UUID filename. Cleanup reconstructs its location under the **current** app container, never a persisted absolute path or customer-supplied URI.
- Markers contain no customer ID, email, credentials, image data or remote URL. Temporary image files remain app-private cache files, not an additional encrypted photo vault.
- Active sessions are protected from startup/foreground cleanup. Normal completion/cancellation tries every owned handle, then reconciles the durable records. Duplicate taps cannot end the original export session.
- A timestamped share hold is written **before** opening the native share sheet. Normal closure releases it. If the host stops while sharing, startup conservatively retains the interrupted share for 24 hours because another app/extension may still be reading it. A later startup/foreground performs expiry cleanup; this is not a background timer or a guarantee of deletion at exactly 24 hours. A backwards clock is treated conservatively as a cleanup error.
- Only recognised direct files in valid session folders and explicitly marked direct SDK JPEGs are deleted. Unknown names, nested directories and ambiguous paths are preserved. Failed SDK removal retains its marker for retry; a session directory is removed only after it is empty.
- Cleanup trouble shows a non-modal retry notice and blocks further exports while unresolved. It does **not** block normal navigation, sign-in or sign-out. A cleanup error does not turn an already successful save/share into a claimed failure.
- Original Photos/Files items, picker files, saved drafts, cloud work, receipts and unrelated SDK cache files are outside this cleaner's ownership.

## Automated evidence

`pnpm check` passed: **798 tests across 49 files**, TypeScript and frozen customer API contracts. The 53 added checks cover pure recovery and the mocked native filesystem adapter: partial writes/restarts, share lifetime/expiry, duplicates, concurrent sessions, ownership registration failures, collisions, invalid paths/clocks, unknown entries, file/directory failures, silent deletion failures, error redaction, retry notifications and web-startup isolation. Mock adapters are not physical-device evidence.

## Native iPhone simulator evidence

- Beta Release/configuration build: `output/ios-simulator-2026-09-09T17-11-12.106Z.log`, passed. Existing dependency/Hermes/script warnings remain; no warning-free build is claimed.
- Installed build's JS SHA256 matched the product: `aba31f0d8988afced01fe2c9761fec6d14483031401afd00f7d887e8ee49e5d8`.
- Device: Furnio Mobile QA, iPhone 17, iOS 26.5, UUID `890062D4-AB26-4389-94E5-043C1C95999D`; owner-selected Xcode beta, no global toolchain changes.
- Selected the original stock flower photo through the system picker. A confirmed local disclosure export opened the system share sheet with an actual JPEG. Its final JPEG, label PNG, two SDK markers and share hold existed while sharing. Cancelling, without selecting a recipient, removed that session and its two tracked SDK images.
- Opened a second share, terminated **only the dedicated demo app**, then relaunched it. The session and share hold were unchanged after startup, as required by the retention policy.
- To test expiry without changing the machine/device clock or waiting a day, changed **only that test session's hold filename** to an expired timestamp. Added a synthetic partial-download file in another valid test session and one unknown sentinel at the export root. On restart, the app reclaimed the expired session, both of its SDK images, and the partial-write fixture. It preserved the unknown sentinel and displayed the retry notice.
- The sample workspace remained accessible with that notice. Removed the exact synthetic sentinel and pressed Retry; the warning disappeared and the app remained on Home.
- Final export-root listing was empty. The pre-existing 13 SDK cache files and 13 picker copies were preserved. No additional Photos save, recipient delivery, upload, AI request, credit use or production call was performed. The synthetic sentinel and all export/partial-write test copies were removed; stock Photos originals and the earlier two saved test JPEGs remain.
- A bounded native error/fault log check found ShareSheet item/file-provider diagnostics, a libxpc assertion log, CoreUI/ImageIO/focus diagnostics and the UIKit future `UIScene` lifecycle warning. The app remained running and the observed share/cancel/restart UI worked, but these logs are **not clean** and actual recipient delivery was not tested. Do not dismiss them as certified harmless; framework/toolchain compatibility and real-device sharing need investigation before release.

## Deliberate remaining boundaries

- An SDK file created **before its path is returned and ownership can be recorded** is still outside this journal. Historical loose files, picker copies, batch-mask caches and the broader account-deletion device closeout have separate ownership/policy work remaining. There is intentionally no sweep of the whole ImageManipulator or cache directory.
- A storage failure during marker creation is cleaned by the in-memory handle when possible; a simultaneous hard crash before successful persistence cannot be claimed fully covered.
- OS cache eviction, locked-device/low-disk behaviour, sharing to actual external apps, real Android and physical-device lifecycle testing remain release gates. No externally delivered copy can be revoked by deleting the source cache file.
- This milestone did not enable purchases, account deletion or backend flags. Main, Admin, all Workers, production, Docker and network settings were untouched. Mobile still has no remote; source changes are saved locally, not pushed.

## References

Installed Expo implementations were checked for `ImageManipulator/<UUID>.jpg` cache naming on iOS/Android and FileSystem's partial-download behaviour. Public API references: [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/), [ImageManipulator](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/), [Sharing](https://docs.expo.dev/versions/latest/sdk/sharing/).
