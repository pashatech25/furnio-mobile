# Device-only draft privacy

Implemented locally on 9 September 2026. This closes the saved-draft lifecycle gap, **not the complete shared-account deletion workflow**. No shared database, website, imaging Worker or authentication configuration changed.

**16:31 update:** a real native picker check exposed the installed SDK's asynchronous `File.copy` behaviour. Draft-copy serialization now awaits each copy before publishing saved metadata or allowing queued cleanup. A delayed-copy regression passes. The full suite is now 1,024 tests/57 files; see `PHOTO_INPUT_PRIVACY.md` for the corrected native build and input/export evidence. The older evidence below remains historical and is not a claim of authenticated native draft acceptance.

## Behaviour

- Native saved drafts copy source/reference files into a dedicated cache scope: environment hash → exact customer UUID → one of nine services → random generation. Metadata, directions, mask strokes, ordering and coordinates use device-only encrypted Keychain/Keystore storage. Photo copies are app-private files, not an additional encrypted photo vault.
- Same-account restart restores valid drafts. Repeated same-account authentication events do not erase drafts or intentionally reset navigation. Expired (48-hour), malformed, missing-file and foreign-generation drafts are cleared at store opening or service load. This is not a background timer or an exact-time physical-erasure guarantee.
- Sign-out/account switching revoke draft access and remove the indexed account’s saved metadata/copies and legacy room/style preferences. The owner index remains until cleanup succeeds. Signed-out startup resumes indexed cleanup.
- Saves, loads and cleanup are serialized and identity-checked across awaits. A late save cannot become usable after an account switch. Interrupted copies are reclaimed on subsequent load/cleanup.
- A **draft-only** encrypted chunk journal indexes new/retired pieces before writing or deleting them. Interruption retains the old value or a deletion tombstone for retry. Authentication-token storage is unchanged. Invalid indexes fail visibly; no guessed deletion paths.
- Saving retains current mask strokes and updates matching photo locations without intentionally replacing source ordering/new selections made while storage is busy. Nothing uploads merely by saving.
- Cleanup errors show a retry option. They do not claim erasure or prevent a normal local Auth sign-out attempt. Account privacy and saved receipt recovery remain accessible.

## Preserved intentionally

- Website sessions and cloud projects, images, credits and billing.
- Purchase, batch, ordinary Studio submission, notification-cleanup and account-deletion receipt namespaces, which may be needed after sign-out. See `SUBMISSION_RECOVERY.md`; include its namespace in separately gated confirmed-deletion closeout, not draft sign-out cleanup.
- Customer originals in Photos/Files, exported/shared images, picker-owned originals and unrelated cache folders.

Only generated draft folders are deleted. No whole-cache wipe, loose user prefix, metadata-supplied deletion path or remote cleanup call is used. Staging and production configurations have distinct draft namespaces.

## Pre-release compatibility and remaining limits

The prior unreleased v1 format did not own photo copies or persist an owner index. Known-account v1 metadata/preferences are retired when that account is opened/cleaned. Unknown historical v1 owners and already orphaned legacy secure chunks cannot be safely discovered by this index. This is not a forensic erase or migration of every previous development draft. No production mobile release exists in this unconfigured scaffold.

Returned temporary picker/manipulator files now have separate scoped ownership and restart cleanup; see `PHOTO_INPUT_PRIVACY.md`. SDK-before-return and historical unowned files remain explicit limits. Partial uploads and confirmed-deletion device closeout remain separate work. Result exports have independent cleanup attempts, durable owned-folder/SDK markers, restart recovery and non-blocking retry; see `EXPORT_RESTART_RECOVERY.md` for sharing-hold and recovery limits. Corrupt secure ownership indexes may require an explicit device-storage recovery procedure; the app does not guess another account’s scope. OS backup/restore, locked-device failures, real OAuth/sign-out, low-disk interruption and mask editing while saving still require physical-device/staging acceptance.

This does not enable destructive account-deletion confirmation. Full identity/provider revocation, personal-record/retention cleanup and operational completion remain outstanding in `ACCOUNT_DELETION.md`.

## Evidence

Final source verification ran at about 08:57 Toronto; the final native build log is `output/ios-simulator-2026-09-09T12-57-11.958Z.log`.

- 48 targeted checks across draft ownership/store, native-cache adapter, encrypted-storage interruption and account-event lifecycle. Mock native adapters are not physical-device evidence.
- Full suite: 625 tests in 38 files; mobile/Worker TypeScript and frozen customer API contracts passed.
- Source inventory: 122 tables, nineteen unchanged/unapplied mobile migrations.
- iOS Release simulator build/configuration passed; installed offline welcome screen inspected. Startup is not an authenticated Keychain/Files lifecycle test.
- No paid generation, real customer sign-out, purchase or production deployment occurred.

## Platform references

Expo documents device-only keychain access and platform persistence; cache files can be reclaimed by the OS. [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/).

Supabase local-scope sign-out differs from global sign-out, and outstanding JWTs do not become invalid merely by removing local storage. This implementation keeps the existing local-scope Auth call and does not call device cleanup server-side deletion. [Supabase signOut](https://supabase.com/docs/reference/javascript/auth-signout).
