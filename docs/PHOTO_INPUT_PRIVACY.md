# Native photo-input lifecycle and asynchronous file copies

Verified locally on 9 September 2026, 16:31 Toronto. This is a native-file safety milestone, not full account erasure or store/staging acceptance. Website, Admin, Workers, production data and network settings were not changed in this milestone.

## What changed

- Studio, Batch and the explicitly labelled result-demo picker now acquire input files through a screen/session-bound owner. Photos and supported floor-plan files are copied into `furnio-photo-inputs-v1/<random-session>/input-<UUID>.jpg|pdf`. User originals in Photos/Files are not deleted.
- SDK cache files returned by the picker/manipulator are journalled by validated cache location and UUID filename before use. Only those recorded files are cleaned; SDK folders and the whole cache are never swept. The installed iOS picker's cache-root fallback is explicitly supported.
- All returned assets, including excess selections and late results after cancellation, are accounted for. Failed conversion/copy and interrupted sessions retain cleanup evidence for retry. Unknown names, locations and nested content fail closed instead of becoming guessed deletion targets.
- Source and normalized file sizes use actual native file metadata and reject empty, invalid or over-20-MiB inputs. SDK size metadata is not treated as authoritative. Image normalization retains full dimensions and produces JPEG; server validation remains necessary.
- Leaving an editor or ending its operation releases its private input copies. Startup/foreground recovery removes abandoned owned sessions. Cleanup failures use the existing non-blocking retry notice and do not rewrite authentication behaviour.
- Input ownership is separate from saved drafts, submission/purchase receipts and result-export sharing holds. Saved drafts keep their own account-scoped copies; active native sharing keeps its existing retention rules.

## Native failure discovered and fixed

The first new build passed the then-current 1,021 mocked tests, but real iOS photo selection failed. The installed Expo FileSystem native implementation exposes `File.copy` asynchronously; synchronous test doubles hid an early destination-existence check.

All production `File.copy` call sites now await completion: owned inputs, saved draft copies and final disclosure JPEG export. Draft copies are serialized so cleanup cannot race an unfinished copy. Export checks cancellation and destination readiness after the copy. Async and deliberately delayed test doubles cover the discovered ordering fault.

The intermediate `output/ios-simulator-2026-09-09T20-18-10.044Z.log` build is **not** accepted native evidence. The final corrected build is below.

## Verification

- Full suite: **1,024 tests in 57 files passed**. This includes 29 input-recovery tests, 26 media-lifecycle tests and a new delayed draft-copy regression. Mocked failure/account-change tests are not physical-device evidence.
- Mobile TypeScript, frozen API contracts and whitespace checks passed.
- Xcode beta Release simulator build and embedded configuration check passed: `output/ios-simulator-2026-09-09T20-22-39.001Z.log`.
- Installed and built JavaScript SHA-256 matched: `15f5bf3689534ab66d26eba49461b8735431ee9c222395d26769be8fb7695e2f`.
- In the dedicated iPhone 17/iOS 26.5 demo simulator, selecting the stock waterfall photo succeeded. One owned JPEG (1,333,123 bytes) existed during Studio editing; returning Home removed that owned session/file.
- Selecting a local result-test photo succeeded and showed 1668 × 2500 dimensions. A real 1668 × 2500 JPEG (1,346,359 bytes) was generated and visually inspected with the bottom-right “Virtually Staged” label. The native share sheet displayed its thumbnail and size. Sharing was cancelled without choosing a recipient or saving/sending the file.
- After cancellation, export sessions were zero and the one active result-input session remained. Terminating/relaunching this demo app recovered both roots to zero sessions. Native container paths were re-resolved after reinstall before these counts were taken.
- The same 27 pre-existing ImagePicker and 27 ImageManipulator cache files remained throughout; they were intentionally unowned and untouched.
- No live authentication, upload, model generation, purchase or actual customer sign-out was exercised. No new listener, Docker action, dependency update or global Xcode/network setting change was made.

## Boundaries and remaining acceptance

- SDK-internal files never returned to the app, a crash before the returned URI is journalled, and historical unowned cache files are not claimed as erased. A failed marker write followed by failed cleanup has an in-memory retry only until it can be resolved; it cannot promise recovery across a crash in that interval.
- Superseded selections can retain their private copies until their still-mounted editor owner closes. This milestone does not prune each replaced selection immediately.
- Active owners are protected from startup/foreground recovery. Recovery is event-driven, not an exact-time background erasure guarantee or encrypted photo vault.
- Physical camera capture, native PDF picking, Android, low-storage/locked-device failures, real Auth account switching and authenticated Keychain draft recovery remain separate acceptance tests. Customer exports outside the app remain under customer/OS control.
- Full server account deletion remains disabled. The published policies do not supply payment-record or backup retention periods; see `PUBLISHED_POLICY_REVIEW.md`.

## Platform references

The installed SDK source was checked alongside the current primary documentation: [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/), [ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/), [DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/) and [ImageManipulator](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/). Platform/SDK cache details are validated at the boundary rather than accepting arbitrary file paths.
