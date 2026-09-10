# Native disclosure rendering — reliability and fitting

9 September 2026, 12:54 Toronto. Local Mobile-only implementation. No website, Admin, Worker, database, authentication, payment or production changes.

**13:55 follow-up:** later testing exposed an actual native glyph-context crash, despite the earlier successful exports. The pinned SVG patch now confines complete measurement to the UI thread and prepares offscreen bounds with a one-pixel render. The rebuilt app passed inspected 4032 × 3024 exports with an 80-character Georgia/top-centre label and with disclosure disabled, including hidden invalid-colour handling and share cancellation/cleanup. See `STUDIO_INPUT_NATIVE_QA.md` for the incident, intermediate failure, binary hashes and exact limits. Earlier pass evidence is not a universal crash-free claim. Restart recovery is separately implemented in `EXPORT_RESTART_RECOVERY.md`.

## Implemented behaviour

- Each export owns its abort controller, image-load/text-ready callbacks and keyed SVG. Leaving the renderer cancels its capture; callbacks from that request cannot start a replacement export. One renderer cannot process overlapping exports.
- SVG capture waits for both the photo and measured text, then one animation frame. The 15-second deadline includes readiness and the native capture callback. Success, timeout, cancellation, duplicate callbacks, text-measurement failure and synchronous frame/render errors settle the request once and detach its handlers.
- Native text bounds, not a character-count guess, determine shrink-to-fit. Preview and export use the same component. Short labels retain the requested size; wide labels shrink to at most 82% of image width with a small rounding inset. Font size starts with the website's 12px minimum, and reduced top-label size also adjusts its baseline. Tiny-image margins/available height are bounded.
- Labels are trimmed for both preview and export. The existing 80-character, font, position, opacity, size and six-digit-color constraints remain. Validation errors now explain the character/color requirement without echoing input or leaking native paths. Controls explain the limit and automatic fitting.
- Captured PNG headers must contain the expected signature/IHDR and exact requested dimensions before writing. Encoded size is bounded relative to requested pixels. This is only an envelope check: native conversion must still decode the full PNG at the original dimensions.
- Prepared and composed JPEG dimensions are checked against the decoded native image and, for composition, the original prepared photo. A resized/blank-1×1 export fails instead of being silently upscaled.
- ImageManipulator image/context references are released independently after their asynchronous writes finish. Cancellation during a write waits for its completion so the returned generated file can still be owned for cleanup. Empty or disabled labels do not allocate a base64 photo for SVG composition.
- Existing export-session cleanup, source ownership and production download/trial checks remain in force. Normal sharing holds its file until the native sheet finishes; no original is deleted.

## Evidence

**745 tests / 47 files**, TypeScript and frozen customer API contracts passed at 12:49 Toronto; `git diff --check` passed. The new 49 cases cover capture readiness/order, invalid/duplicate/stale callbacks, abort before/after scheduling, timeout at each readiness stage, synchronous failures, PNG header/dimension/size rejection, late-write ownership, reference release, source/JPEG resolution, fitting and validation messages. These dependency-injected tests are not native-device fault injection.

Final beta Release simulator build and embedded configuration passed:

`output/ios-simulator-2026-09-09T16-49-34.710Z.log`

The installed and built `main.jsbundle` hashes match:

`72be3c6dc2ee98547c7afc6e78550df2a22b9a20cb89118d91fbb39f8325734d`

Native checks in the existing Furnio Mobile QA iPhone 17/iOS 26.5 simulator:

1. The preceding 12:42 build exported an 80-character sentence at top centre and an 80-`W` stress label, inspected in the actual JPEG. The wide label shrank and remained inside the photo at full 4032 × 3024 resolution.
2. Accessibility input bypassed the field's normal `maxLength` and supplied 81/82 characters. Export was correctly rejected; the vague initial message was replaced. The final build shows **Use no more than 80 characters for the disclosure text.**
3. Correcting that input to 80 characters on the final build successfully exported all 80 `W`s at bottom right within the photo. Actual JPEG inspection and file metadata confirmed 4032 × 3024. This also tested recovery from validation failure.
4. Restoring normal text, disabling disclosure and sharing again produced an actual 4032 × 3024 JPEG without a label. No disclosure PNG was created for that export.
5. Native share sheets opened with the real JPEG. Every sheet was cancelled without choosing a destination/recipient. Named final/disclosure files were present during sharing and absent afterward. No additional Photos assets were saved in this milestone; the two earlier test JPEGs remain.

## Explicit remaining boundaries

- No native fault injection has yet simulated low disk, OS-killed exports, suspended rendering, denied Photos permission or a hung ImageManipulator decode/write. The capture deadline does not pretend to cancel an SDK write already running. Crash/restart orphan cleanup remains unfinished.
- All fonts/positions, multilingual/emoji-only labels, panorama/portrait/rotated photos, physical devices and Android still need acceptance. SVG's installed `getBBox` is labelled experimental; the observed iOS pass is not an Android guarantee. Failed measurement blocks disclosure export rather than saving an unverified clipped label.
- Hidden invalid settings no longer block an explicitly disabled disclosure export. They remain preserved and are validated again when enabled; native verification is recorded in `STUDIO_INPUT_NATIVE_QA.md`.
- Shared-account staging, authorized cloud downloads, all-nine-service parity, native billing, deletion and store-release gates remain as documented in `PROGRESS.md`. The app is not store-ready.
- No Metro/server/listener, Docker restart, global Xcode selection or network setting change was needed. Android's four exact SDK dependencies remain absent at the final check. Mobile still has no Git remote; nothing was pushed.

Implementation references: inspected the installed `react-native-svg` Text/Shape/native getBBox and Expo SDK 57 ImageManipulator sources. [Expo ImageManipulator documentation](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/) describes local render/save and native image references; [react-native-svg usage](https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md) is the library's upstream reference. Local version-specific source and actual native pixels take precedence over generic examples.
