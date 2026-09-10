# Furnio store submission status

## Current checkpoint — 10 September 2026

### Apple screenshot order and availability verified

Both approved screenshot sets are now ordered numerically `01` through `06`, verified from Apple's screenshot controls after keyboard reordering (no replacement artwork). Saved free download pricing (`$0.00`) and launch availability for Canada and United States only; both countries show “Available on App Release.” Disabled Apple Silicon Mac and Vision Pro availability to retain the approved phone/tablet release scope. These are listing settings, not a release or review submission.

Owner confirmation requested for third-party content rights (photos, fonts and pencil sound), and the private Apple reviewer contact name/email/phone plus permission to enter them. Those declarations/contact fields remain unfinished pending the answers. Permanent account deletion, review access and final release builds remain separate release gates.

### Apple listing upload checkpoint

Owner completed Apple sign-in. Verified Furnio app 6810452958, version 1.0, Prepare for Submission. Uploaded all six approved iPhone screenshots in the 6.9-inch slot (Apple reuses them for 6.5-inch), and all six approved iPad screenshots in the 13-inch slot. Saved description, keywords, support URL (`https://furnio.ai/contact`, HTTP 200 verified) and marketing URL. Apple accepted the iPad size-reuse notice. Manual release remains selected. Screenshot ordering is now corrected and verified as described above. No build or review submission is claimed; reviewer access/contact, copyright, privacy/content declarations and release gates remain.

### Upload signing checkpoint — 10 September

Dedicated Android upload signing implemented and tested (two focused tests and mobile TypeScript pass). First production AAB built successfully in 2m53s; JAR signature verified as Furnio Upload, embedded environment `production`, package `ai.furnio.app`, version `0.1.0`. This is a locally signed bundle, not a Play upload or final 1.0 candidate. See `ANDROID_UPLOAD_SIGNING.md`; rebuild after remaining app changes. Owner confirmed seven-year payment-record retention; recorded in `ACCOUNT_DELETION.md`. Apple still presents a sign-in screen. No website/database/Worker deployment made.

### Store upload checkpoint — 08:55 EDT

- Google Play default English listing: description, approved 512px icon, 1024×500 feature graphic and all six Android screenshots uploaded and saved. Console confirmed “Your changes have been saved.” Review screen now requests the new AI-asset declaration; owner confirmation requested before making that declaration. Screenshot order still needs final verification (bulk upload used completion order).
- Apple session expired; requested owner sign-in. No Apple screenshot/binary upload is claimed.
- Re-ran verification: mobile TypeScript, all 1,114 tests across 72 files, Worker TypeScript and frozen API contracts passed. One catalogue parity test initially failed solely on a blank line; it now ignores empty formatting lines while preserving verbatim comparisons of all nonempty catalogue content.
- Public submission remains gated by unfinished permanent account deletion, private reviewer access, accurate store declarations and distribution builds. Google still requires its closed-test period. Android generated release configuration currently uses the debug signing key and must not be uploaded as a store release.

Artwork update: owner approved the complete gallery—six iPhone, six Android and six iPad compositions, store icons, and the previously approved feature graphic. Full-resolution files are saved in `store/exports/`; provenance is recorded in `store/ARTWORK_STATUS.md`. Screenshot approval is complete. Uploads and release gates below remain separate and are not marked complete by this approval.

This checkpoint supersedes stale environment/device statements below. Owner explicitly authorized production testing; latest iPhone install uses production, with native purchases/push/permanent cleanup still disabled. Physical device signing and installs now work. Local acceptance fixes and 1,112 tests are committed and pushed to `https://github.com/pashatech25/furnio-mobile.git`, branch `main` (implementation commit `16ac021`). Generated builds, local env files, signing files and IDE state excluded. GitHub initially flagged a hardcoded Twilio account SID; it was removed from the unpublished commit and the staging script now requires local configuration. No push-protection bypass used.

Reopened and read both live store dashboards. Apple is signed in and still **1.0 Prepare for Submission**; content rights and age ratings are not completed. Google still shows **0 opted-in testers**, **12 testers / 14 continuous days**, and disabled production application. Asked owner for the tester group/emails. No binary/review submission was performed during this checkpoint.

Prepared `store/listing.en-US.json`: descriptions, subtitle, keywords, territory intent, and private-review checklist. Field lengths validated. `store/ASSET_BRIEF.md` defines the branded screenshot sequence and official output requirements. These are drafts, not uploaded listings or completed artwork. Capture actual native screens using fictional identifying data before compositing/uploading; do not substitute prototype UI.

Next execution order: complete real native screenshot assets and review access; finish production account deletion with approved retention; audit privacy and purchase-link policy; distribution-signed builds; private acceptance/TestFlight/Play test tracks; final review submission. Optional push is not a prerequisite if omitted accurately from this release. Do not bypass Google's test period or label unfinished cleanup as ready.

## Current scope

Website-only purchases; no RevenueCat or Apple/Google purchase products for this release. See `WEB_PURCHASES_DECISION.md`. A draft listing is not a submitted or published app.

## Google Play — verified 9 September 2026

- Owner confirmed the Realview Hub developer account (`6817687518068560996`).
- Owner accepted the form declarations and created Furnio. Verified the resulting Furnio dashboard: app ID `4974076945955558731`.
- Package selected: `ai.furnio.app`; free app, English (US).
- [Open Furnio in Play Console](https://play.google.com/console/u/1/developers/6817687518068560996/app/4974076945955558731/app-dashboard).
- Console explicitly requires **at least 12 testers continuously opted in for at least 14 days** in a closed test before applying for production access. Currently zero testers; application for production is disabled.
- Internal testing can precede that step. No binary has been uploaded and no test/public release has been submitted.
- Remaining: signed bundle; approved store copy/screenshots; app-access review credentials; content, privacy and Data safety declarations; deletion URL/workflow; complete private acceptance; closed testing and production application. No declarations should assert unfinished functionality is complete.

## Apple — listing created, Xcode account verified

- Membership active: Alipasha Amidi, Individual, team `5SY24C9RBH`, renewal 9 September 2027. Owner completed purchase and agreements; the old Pending/account-not-enabled/agreement-banner blockers are resolved. Do not repeat enrollment or payment.
- Explicit App ID registered: `ai.furnio.app`, description Furnio, with Push Notifications and Sign In with Apple (primary App ID). Apple's default In-App Purchase capability is not a product configuration; no native commerce was enabled.
- [Furnio App Store Connect listing](https://appstoreconnect.apple.com/apps/6810452958/distribution/info): Apple app ID `6810452958`, SKU `furnio-ios-001`, iOS, English (U.S.), **1.0 Prepare for Submission**.
- Saved metadata: subtitle **AI real estate photo editor**; primary category **Photo & Video**; secondary **Business**. Version release set and saved to **Manually release this version**.
- **Both signing certificates are created and verified: two valid Keychain identities**, one Apple Development and one Apple Distribution, both for team `5SY24C9RBH`. Owner supplied the final Xcode screenshot; command-line verification confirms the matching local private keys and Distribution validity. These are different certificate types, not duplicates. Added only the missing public Apple WWDR G3 intermediate with normal trust defaults; no private-key export/trust override/revocation. See `IOS_SIGNING.md`. Do not request or create additional certificates. Zero provisioned devices at last team check.
- `app.config.ts` now retains `appleTeamId: "5SY24C9RBH"`. TypeScript and four commerce-policy tests passed. The generated native project has not been regenerated for the new team setting. Source app version remains `0.1.0`; align it deliberately with the store version before a release archive.
- No provisioning profile, binary, screenshot upload, privacy/age/content-rights declaration, review submission or public release has been completed. Canadian/US availability still needs configuration.
- Toolchain: installed Xcode 27 beta 6 is the accepted local QA toolchain. Apple published Xcode 27 RC (`27A266a`) on 9 September 2026; it has **not** been downloaded/installed. Check release-toolchain compatibility before the store archive; do not assume the existing beta simulator build is store-ready. See [Apple releases](https://developer.apple.com/news/releases/) and [upload requirements](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/).

## Verification boundaries

Current builds use isolated staging, not production. Imaging/outbound services and permanent deletion remain gated until their own acceptance. Do not upload an unfinished staging-only build as the public production app, promise public release before the required Play testing period, or re-enable native purchases to bypass release blockers.
