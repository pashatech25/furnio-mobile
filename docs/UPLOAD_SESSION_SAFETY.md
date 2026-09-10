# Mobile editor upload/session safety

Updated 9 September 2026, 14:17 Toronto. Implemented locally; not deployed or staging-certified. The full customer app is still in progress.

## What was found

The general mobile API helper obtained the currently active Supabase bearer independently for each request. Studio kept its original project, photos and settings across an asynchronous presign → storage PUT → completion → job sequence. An account change between those steps could therefore give a later step a different account's token. Existing server ownership checks remain important, but the client must not attempt that mixed-account sequence.

Batch checked the user before/after an upload, but the upload and mask helpers themselves still used the general bearer lookup. Ordinary Studio also lacked a screen/session fence for late picker, mask-export, upload and result callbacks.

## Implementation

- `src/auth/operation-scope.ts` creates ephemeral scopes tied to the initiating customer and Auth `session_id`. Same-session token refresh is allowed. Logout, another customer, a replacement session for the same customer, screen disposal or a sign-out-start pause permanently invalidates old scopes.
- The Supabase notification callback is synchronous and makes no asynchronous Auth calls. The adapter reads a fresh same-session token when needed. No additional tokens/session IDs are persisted, and no authentication provider, callback URL, SMS flow, server permission or web login was changed.
- Parsing `sub` / `session_id` is **local correlation only**, not a signature check or authorization. The existing customer API must still verify signed tokens, ownership, verification, feature access, prompts and credits.
- `createApi` supports an optional operation boundary; it checks before/after token retrieval and after response/body reads. Cancellation never turns an uncertain dispatched POST into a safe-to-repeat request. There are no automatic POST retries.
- JSON requests retain their 30-second deadline even with an external cancellation signal. Signed storage PUTs retain 120 seconds. Timers/listeners are disposed when each request ends.
- All Studio and Batch photo/mask uploads now use the scoped transport. The former unscoped upload exports/default mask sender were removed. Original service inputs, multi-view ordering, references, mask parameters, quoted costs and server-side prompt selection remain unchanged.
- Photo byte length is checked against the selected/reserved metadata before upload. Completed asset IDs must match their allocation. Signed storage requests reject credentials in the URL and Authorization/Cookie headers; a customer bearer is never attached to a storage PUT. Storage failures are redacted and do not start a job.
- Studio and Batch picker/submission callbacks check their scope before updating state or navigating. Studio draft-save UI is also fenced. Batch recovery records remain attached to their original user; canceling the UI does not erase reservation/job evidence or trigger a second reservation.
- Sign-out pauses these editor operations **before** asynchronous device/push cleanup. If sign-out fails, only newly started operations may run after the pause ends; old operations cannot revive.

Cancellation means “stop further client steps.” It cannot recall bytes or a job that the server has already accepted. Existing server jobs can finish normally; no new server cancel/refund behavior is claimed.

## Verification

`pnpm check` and `git diff --check` passed at 14:12: **892 tests across 53 files**, TypeScript and frozen customer contracts.

New injected-session/transport tests cover:

- Token refresh within one session, logout, another user, same-user replacement session, and A → B → A during a pending session read.
- Malformed/anonymous metadata, synchronous subscription notification, subscription disposal, overlapping sign-out pauses, sign-out failure and redacted session-read errors.
- Identity change during file reading, presign, storage PUT, completion and delayed JSON; no later photo/job dispatch and no second account bearer.
- Reserved-photo and mask upload interruption, incorrect byte lengths, mismatched completion IDs, insecure URLs/headers, oversized masks and no storage retry.
- Cancellation during a PUT, cancellation before dispatch, uncertain dispatched POSTs, deadline preservation and timer/listener cleanup.

These tests use synthetic sessions, fixture bytes and injected fetch responses. They do not contact Supabase, a live database, Stripe, RevenueCat, storage or FAL.

### Installed native smoke test

The beta Xcode arm64 Release/demo build and embedded configuration validation passed:

- Log: `output/ios-simulator-2026-09-09T18-13-01.094Z.log`.
- Executable SHA256: `1a4614c839f613453dc452fc8f3ca00de98b7f3ac57fd20af1757b2c321b02d1`.
- JS SHA256: `b345b311a313a00b4f5f4356b337b98f12143563b22d19aa104bab53fee075f6`.
- Installed executable/JS hashes matched. Dedicated simulator: `890062D4-AB26-4389-94E5-043C1C95999D`, bundle `ai.furnio.app`.
- Passed sample login, stock-photo picker, Studio sample submission, result navigation and Back with the selected photo retained.
- Passed a two-stock-photo batch, disabled submission before both reviews, both review steps, explicit sample-only confirmation and two sample queued results.
- Returned to Home. No external image sharing, real photo processing, live credits or charges occurred. Owner-accepted brushing was not retested.
- App PID 56755 remained alive; no new Furnio crash report appeared in the bounded check at 14:17. Dependency/framework build warnings remain; this is not a warning-free build or a signed device/store build.

## Still required — do not overstate completion

1. **Durable ordinary Studio submission recovery:** its current uncertain-request warning is screen state, not yet a persistent job-intent journal. A crash/restart or re-opening the editor can hide that warning. Add a user/environment-scoped pre-dispatch receipt and explicit project-history reconciliation before claiming duplicate-submission recovery complete. Do not automatically replay a non-idempotent job POST.
2. **Picker/SDK cache ownership:** a late picker result is ignored, but this change does not yet reclaim every normalized/picker-generated file or a native allocation interrupted before its URI is returned. Never sweep cache directories or delete originals/drafts to hide this gap.
3. **Dialog scope:** guarded editor callbacks no longer open stale result/error UI, but a dialog already visible before a navigation/account transition needs a separate global dialog-lifetime audit.
4. **Real staging and devices:** execute authenticated account switching, sign-out, token refresh, poor network, backgrounding and interrupted uploads with isolated staging and physical iOS/Android devices. Server BOLA/credit enforcement, prompt parity and all-nine-service acceptance remain independent gates.
5. Larger commerce, deletion, notification, store-account, signing, Android and release gates remain as recorded in `PROGRESS.md`.

No website, Admin, Worker, migration, production flag, DNS, proxy, firewall, Docker or global Xcode setting changed. No Metro or additional listener was started. Mobile still has no Git remote; work is saved locally, not pushed.

## Documentation used

The Supabase skill guided synchronous Auth notifications, session-lifetime correlation and the distinction between local metadata and server authorization. Current documentation was checked against the [Supabase changelog](https://supabase.com/changelog) and [Auth state-change reference](https://supabase.com/docs/reference/javascript/auth-onauthstatechange). This change adds no schema, RLS rule, administrative credential or elevated access.
