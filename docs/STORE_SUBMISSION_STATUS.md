# Furnio store submission status

## Build 5 native-commerce checkpoint — 22 September 2026

- Physical iPhone sandbox purchase of `ai.furnio.app.credits50.v1` completed. RevenueCat verification, webhook delivery, one isolated 50-credit grant, recovery idempotency and exact checkout settlement were verified. The customer's production balance and real native ledger were unchanged.
- Physical iPhone sandbox purchase of `ai.furnio.app.starter100.monthly.v1` completed. The subscription is active, its configured 105-credit monthly grant was recorded once, the checkout and event are completed, and the isolated sandbox balance is 155. No production native grant was created.
- RevenueCat's Apple consumable product type is now accepted without accepting non-consumable products. The mobile Worker deployment containing that verifier is live. A follow-up database migration atomically settles the exact sandbox checkout with its verified receipt and repaired the already-completed test checkout.
- Mobile validation passes: 1,195 tests / 82 files, TypeScript, Worker TypeScript and frozen customer API contracts. The checkout-settlement migration passed the complete 57-check isolated application-schema replay before deployment and both live sandbox purchases verify the deployed behavior.
- Signed production archive `output/store/Furnio-2026-09-22T14-21-31.764Z.xcarchive`, version 1.0.0 build 5, passed production configuration and codesign verification. Upload succeeded at 10:30 EDT; App Store Connect completed processing and shows build 5 Ready to Submit. Five framework dSYM warnings were non-blocking.
- **Apple confirms Waiting for Review for all eight submitted items.** At 13:44 EDT, App Store Connect accepted iOS 1.0 build 5, four consumable credit packs, two monthly subscriptions and the localized Furnio Customer Plans subscription group under submission `f05d2da3-f15b-412f-8c20-46e920cc6db3`. Each item independently shows Waiting for Review. Product review screenshots/notes and the app metadata/reviewer notes are saved; Studio1200 remains excluded. The prior removed submission no longer exposes a Reply control, so the complete purchase and account-deletion response remains in build 5's App Review Notes for the reviewer.

## Current iOS restoration gate — 15 September 2026

This section supersedes historical iOS completion/submission checkpoints below.
The new native-purchase build has **not** been uploaded or submitted.

| Requirement | Verified current state | Next evidence required |
| --- | --- | --- |
| Apple commerce agreement | Accepted; Pending User Info | Owner banking, Canadian GST/HST and U.S. tax forms; active agreement |
| Six iOS products | IDs, prices and CA/US availability configured; Studio1200 excluded | Physical StoreKit catalog, review screenshots and final product status |
| Physical purchases | Latest development-signed build installed; real account balance corrected to 15 | Sandbox purchase, verified server delivery, restore/retry and account-switch checks |
| Sandbox isolation | Private accounting and owner enrollment deployed | Usable isolated processing entitlement; batch/consumer routing acceptance before enabling |
| Web protection | API 348 tests, web 58 tests, both typechecks pass | Selective compatibility rollout and authenticated production acceptance |
| Admin integration | 102 tests, typecheck and production build pass | Authenticated deployed native billing/reporting acceptance |
| Account deletion | Existing in-app request flow and prior recording | Latest build reauthentication/confirmation and operational cleanup verification |
| Final submission | No new archive upload or submission | Final signed build, six IAP attachments, updated review evidence; visible submission confirmation |

Mobile suite: 1,192 tests/81 files and typecheck pass. These checks are not a
substitute for StoreKit or physical-device verification. Native acquisition for
ordinary customers remains disabled. Existing Android release is unchanged.
Detailed implementation and deployment history: `IOS_COMMERCE_RESTORATION.md`.

### Verified update — 22 September 2026

- Apple paid agreement, bank account and required tax forms are Active.
- After renewing only the owner's expired private sandbox enrollment, the
  physical iPhone returned all six requested StoreKit products. Product display
  is no longer blocked.
- The six products are still Prepare for Submission and missing review
  screenshots. A sandbox transaction and server-side grant/recovery evidence
  remain required before creating and uploading build 5.
- Uploaded build 4 is still the rejected website-only-purchase submission; the
  newer local purchase implementation cannot be uploaded again as build 4.

## Android review submission sent — 13 September 2026

- Owner explicitly authorized IARC Terms acceptance. Completed and saved the questionnaire: All Other App Types; online AI-generated content disclosed; no native social content exchange or in-app purchases. IARC returned ESRB Everyone / PEGI 3; the separately declared intended audience remains adults 18+.
- Clicked **Submit 14 changes for review**, then confirmed **Send changes for review**. Google Publishing overview now shows **Changes in review**, including Android 1.0.0 (2), Alpha rollout, Canada/US, the 12-person tester list, ordered approved graphics, listing and completed declarations. No outstanding unsubmitted changes were shown.
- Google automated quick checks are still running (UI says up to 14 minutes); the console states changes proceed to review automatically after these checks pass. This is submitted for closed testing, not approved, not public production, and not the start of the required opted-in testing period. Do not remove changes or resubmit unnecessarily.
- Apple submission, app code, Workers and production database were untouched during this submission turn. The earlier incomplete-content-rating blocker below is resolved and superseded by this checkpoint.

## Android closed-test release prepared — 13 September 2026

- Fresh production Android bundle `output/store/furnio-production.aab`, version 1.0.0 (2), built successfully with the existing upload key. `pnpm check` passed: 1,155 tests / 78 files, typecheck and frozen API contracts. Signature and production bundle configuration verified by the build script. Logs: `output/android-submission-check.log`, `output/store/android-final-submission-build.log`.
- Uploaded and Google accepted bundle 2 into Alpha track `4699377041554004679`. Release saved as `1.0.0 (2) — Furnio Android closed test`. No blocking binary error; only a non-blocking missing deobfuscation-file warning (release Java/Kotlin minification is disabled).
- Created and selected the owner's exact 12-address tester list, `Furnio Android closed test — September 2026`; old six-address list remains unselected. Selected Canada and United States, feedback `alipasha@furnio.ai`. Test enrollment URL is `https://play.google.com/apps/testing/ai.furnio.app`; do not describe it as live before release approval. Console currently shows zero testers opted in, so the 14-day eligibility period has not started.
- Saved privacy URL, reviewer email/password access instructions, no-ads/advertising-ID declarations, adult target audience, government/financial/health declarations, photo-access justification, Data safety and Photography category. Public support is `support@furnio.ai`, website `https://furnio.ai/`. Public account deletion URL points to `https://furnio.ai/privacy#section-14`, partial data deletion to section 4; these public sections were checked live.
- Saved approved icon, feature graphic and all six Android screenshots in intended order `android-01.png` through `android-06.png`, full description and short description. Declared AI-edited example imagery for feature graphic/screenshots, not the official icon. Listing is Ready to send for review.
- **Not submitted yet:** Publishing overview has 13 changes ready, with exactly one blocking issue: incomplete content ratings declaration. IARC agreement is awaiting the owner's explicit consent; the prepared questionnaire uses `alipasha@furnio.ai` and All Other App Types, with the agreement unchecked. Complete that questionnaire after consent, then submit changes and verify actual In review status. Automated quick checks are also running. Do not confuse saved release or uploaded bundle with submission.
- Apple build 4 / existing review submission was not changed. No new recording, paid generation, production database mutation or Worker deployment was performed for this Android submission preparation.

## Resubmission confirmed — 13 September 2026, 02:47 EDT

- **Apple confirms Waiting for Review for version 1.0.0 (4).** Selected build UUID `653386aa-aff8-4bee-ae91-18df93d7f614`; submission ID `8a38cd31-4379-4972-ad62-41c24a07b245`. UI shows Date Submitted Sep 13, 2026 at 2:47 AM, Submitted By / Last Updated By alipasha amidi. This supersedes all pending/draft/resubmission statements below.
- Complete six-part response posted at 02:46 EDT with the original-content launch/login/credited-dashboard recording attached. The full registration/SMS/project/staging/comparison/download/deletion-request recording is saved in App Review Information. Completed Notes reference both delivered recordings. Neither original was edited; only lowercase-extension copies were used for Apple's file-type validation.
- Update Review changed the item to Ready for Review; Resubmit to App Review then produced verified Waiting for Review at both submission and item levels. No agreement, pricing, release-policy, code, database, or Worker change was made. Manual public release remains selected; this is a review resubmission, not approval or publication.
- Both owner recordings and reviewer access are supplied; no additional recording is currently requested. Wait for Apple's actual review response. Preserve the reviewer account. Minor legacy account-footer wording is recorded in `APPLE_REVIEW_2_1_RESPONSE.md` for future cleanup; do not silently rebuild or replace this submitted binary.

## Both recordings delivered — 13 September 2026, 02:46 EDT

- Received and inspected the owner's second physical-device recording (59.305 seconds). It shows the iPhone Home Screen launch, email/password reviewer login, 50-credit balance, dashboard, services and account navigation. Both recordings are unedited; lowercase-extension copies are byte-identical to the originals.
- Posted the six-part response to Apple's Guideline 2.1 message at 02:46 EDT with `Furnio-iPhone17ProMax-build4-launch.mp4` attached. Verified Messages (2), the posted text, launch-video attachment and Download control; the response is no longer a draft.
- Updated and saved App Review Notes to identify the delivered launch clip in the review conversation, retaining the full-flow recording as the App Review Information attachment. All six answers are present, including reviewer credentials instructions, actual trial-vs-credit behaviour, external services and asynchronous account-deletion completion window.
- Clicked Update Review for build 1.0.0 (4); final resubmission status is recorded in the next checkpoint only after Apple confirms it. No application source, database rules or deployed Workers were changed during this submission task.

## Recording and review preparation — 13 September 2026

- Apple processing for build 4 is complete / Ready to Submit; build UUID `653386aa-aff8-4bee-ae91-18df93d7f614`. Selected build 4 in the version's Build field and saved. Version now shows Prepare for Submission with Update Review available; the old Guideline 2.1 submission has not yet been resubmitted.
- Received the owner's physical-iPhone full-flow recording, `ScreenRecording_09-13-2026 02-27-10_1.MP4` (213.120 seconds). Owner explicitly chose the original with no privacy blurring. A byte-identical `.mp4`-extension copy was needed because Apple rejected uppercase `.MP4`; accepted attachment is `Furnio-iPhone17ProMax-build4-full-flow.mp4`. Upload processing finished, the filename is displayed as the saved App Review Information attachment, and Save is disabled after completion.
- Entered and saved all six factual App Review Notes answers (3,592 characters), distinguishing a trial-preview generation from paid access and an accepted deletion request from completed erasure. The full video starts with Furnio already open. Owner asked for a short additional Home Screen → Furnio launch → credited dashboard/service-list clip, without repeating signup/processing/deletion or spending more credits. Supplementary clip is still pending.
- Matching six-part reply is saved as an Apple conversation draft at 02:43 EDT, verified by Continue Draft / Delete Draft controls. It references the full video in App Review Information and explicitly says the supplementary clip is pending. Resume that draft, attach the short clip, update both Notes and reply to reflect what is actually received, then post and use Update Review / Resubmit. Do not mistake the visible draft for a posted message.
- Reviewer account checked read-only: 50 credits and account-specific phone-verification exemption. Owner was given its local credentials-file link for the launch clip and instructed not to delete it. No new credits or verification-policy changes made.
- The later owner-requested reset deleted recreated test account `32f8c35c-25ca-484c-adb8-56cc711bbc57` and its one project, two assets, one completed job, seven owned media objects, and released its phone claim. This was before the latest recording/account-deletion request. Do not run another reset without a new explicit request.

## Current checkpoint — 13 September 2026, 02:18 EDT

- **Build 4 upload succeeded.** After the owner restored the Xcode Apple Account, retried the existing signed archive `output/store/Furnio-2026-09-12T20-35-27.549Z.xcarchive` without rebuilding or recreating certificates. At 02:18:41 EDT Apple reported `Upload succeeded`, followed by `Uploaded Furnio`, `EXPORT SUCCEEDED`, and exit 0. Log: `output/store/ios-upload-build-4-retry.log`.
- Apple reported the uploaded package processing. Completion of processing and selection of build 4 for App Review are not yet verified: the separate App Store Connect browser session expired and is showing Sign In. Owner asked to sign in; Xcode account access is working. This supersedes the build-4 upload failure below.
- Five non-blocking missing-dSYM warnings remain for ExpoImageManipulator, React, ReactNativeDependencies, SDWebImage and hermesvm. They did not prevent the binary upload; symbol remediation remains separate.
- At the owner's renewed request, deleted the newly recreated `pashatheteq@gmail.com` account `69ca7f9c-02b3-4514-b323-39085f1262aa`: one project, two asset records, one completed job and seven exact owned media/temp objects. Verified Auth/profile/project/asset/job absence and each object's absence. Phone +16479171234 is released with no active/blocked claim. Main and reviewer accounts preserved. No media backup or download was made. Do not repeat against another recreated account without a fresh request.
- Build 4 is already installed on the owner's iPhone. Upload is not App Review resubmission or public release. The owner's physical-device recording is still required for the Guideline 2.1 response; do not submit an incomplete response or claim the recording is received.

## Build 4 — 12 September 2026

- Fixes the normal sign-in/signup/SMS account-loading screen flashing recovery buttons. Actual errors retain retry, sign-out and privacy access; authorization and trial rules are unchanged.
- Reference-furniture preview uses the byte-identical website before/after photos. Explicit container dimensions prevent bundled-image intrinsic dimensions from cropping the room into walls. Static service posters have the same sizing correction.
- Single and batch processing consent say “third-party AI processing services”, retaining the shared inputs, purpose, explicit permission and privacy link.
- Owner-supplied pencil MP3 is byte-identical and 2.952 seconds. Fixed late asset loading and foreground resume, enabled media playback in silent mode, retained background/unmount cancellation and no microphone permissions. Animation follows decoded clip duration; reduced-motion remains respected.
- 1,133 tests across 76 files, mobile TypeScript, frozen contracts and two native redirect configuration tests pass.
- Signed production archive verified: `output/store/Furnio-2026-09-12T20-35-27.549Z.xcarchive`. Release-testing export succeeded and codesign passed. Installed over the existing app on the wired iPhone 17 Pro Max; device inventory confirms `ai.furnio.app`, version `1.0.0`, build `4`. No uninstall or data reset.
- Remote launch was explicitly denied because the phone auto-locked (not an observed crash). Owner asked to unlock; physical audio, preview and auth-return acceptance are not yet claimed. Local reference preview browser inspection was blocked by file URL policy, so no browser visual pass is claimed.
- Build 4 App Store upload attempt failed immediately with `exportArchive Failed to Use Accounts`; it was not uploaded or submitted. The Mac was also reported locked. Build 3 remains the last successfully uploaded build. Recheck Xcode account access after unlock rather than recreating signing certificates.
- Follow-up verified after unlock: Xcode's Apple Accounts list is empty, not merely a locked-keychain error. Release Xcode 26.6 CLI builds work but its GUI is refused by LaunchServices on this macOS 27 beta. The existing `/Users/alipashaamidi/Downloads/Xcode-beta.app` GUI opens correctly and shows Sign In. Its Apple Account sign-in sheet is open/raised for the owner. Do not recreate certificates or rebuild; restore this existing account, then retry the build-4 archive upload using release Xcode. App Store Connect browser is already signed in and confirms build 3 `Complete` / `Ready to Submit`; build 4 is absent.
- Owner requested another recording reset. Exact newly recreated `pashatheteq@gmail.com` account `0bc0981d-8db0-42f9-a8db-15760e373953` deleted after guarded inventory; one project, two assets, one completed job and seven exact media/temp objects removed and absence verified. Phone +16479171234 has no active/blocked claim. Main and reviewer accounts preserved. Do not rerun this reset against a newly created account without another user request.
- Production deletion callback and mobile support credential repaired; live synthetic request/review/idempotency/status/unauthorized receipt tests passed and the empty synthetic account/request were removed. See `ACCOUNT_DELETION.md` for the manual-completion boundary. No changes to web prompts, models, services, payment rules or customer credit balances.

## Build 3 — 12 September 2026, 13:00 EDT

- 1,124 tests, TypeScript and frozen customer API contracts pass.
- Release Xcode 26.6 produced a signed production 1.0.0 (3) archive: `output/store/Furnio-2026-09-12T16-56-44.405Z.xcarchive`. Includes the iOS modal-freeze repair, final-only results for single-output services and visible mask-region frames. No server/business-rule changes in this native build.
- A release-testing export from the SAME archive passed codesign/version verification and installed successfully over Furnio on the wired iPhone 17 Pro Max, iOS 27.0 (24A435).
- Remote launch was refused because the phone had auto-locked. This is not evidence of an app crash. Owner asked to unlock and test the installed build.
- At 13:00 EDT, App Store Connect upload completed: `Uploaded Furnio`, `EXPORT SUCCEEDED`, exit 0. Apple processing remains separate. Five non-blocking missing-dSYM warnings remain for ExpoImageManipulator, React, ReactNativeDependencies, SDWebImage and hermesvm. Do not call this submitted or approved.
- Apple still shows rejected 1.0.0 (2), Guideline 2.1, with its six-item information request. The physical-device recording and completed response/Notes remain pending; see `APPLE_RECORDING_CHECKLIST.md`.

## Current checkpoint — 12 September 2026

At 10:47 EDT, the corrected production-configured development build passed signing verification, installed over the existing app on the connected iPhone 17 Pro Max (iOS 27.0 / 24A435), and launched with its console attached. Build log: `output/ios-device-2026-09-12T14-45-34.346Z.log`. Owner reproduction of the upload freeze is pending. Startup emitted optional background-fetch/notification capability warnings; no immediate launch termination was observed. No store build or resubmission was made for this repair.

Apple submission `8a38cd31-4379-4972-ad62-41c24a07b245` was submitted on 10 September at 15:32 with version 1.0.0 build 2. Apple has now rejected it under 2.1.0 and requested a physical-device recording plus the six supporting answers. This supersedes historical statements below that submission had not occurred. See `APPLE_REVIEW_2_1_RESPONSE.md` for the unsent draft and recording requirements.

Owner reports a freeze after the green upload overlay appears and disappears on iOS 27. Source inspection found overlapping native modal dismissal/presentation and navigation during upload-modal dismissal. The local repair waits for iOS confirmation-modal dismissal before executing its action and displays upload progress as an overlay within the page. TypeScript and 78 existing submission/input/disclosure tests pass. Physical-device verification remains pending: the paired iPhone is found wirelessly but reports locked when diagnostics are requested. Do not claim the reported freeze is fixed until reproduced/retested on the device. No new Apple response or resubmission has been sent.

## Current checkpoint — 10 September 2026

### First iOS upload succeeded — 14:33 EDT

Xcode App Store distribution export succeeded, producing `output/store/ios-distribution-1/Furnio.ipa` (approximately 25 MB). The subsequent upload returned **Upload succeeded**, **Uploaded Furnio**, exit 0; Apple reported the package processing. This is an upload, not App Review submission, tester distribution or public release. Five bundled frameworks emitted missing-dSYM upload warnings (ExpoImageManipulator, React, ReactNativeDependencies, SDWebImage and hermesvm); track symbol remediation separately. Some device symbols are present in installed Pods and need UUID verification before supplementary upload.

Android rebuilt successfully in 45 seconds with 1.0.0 app configuration and native version name. Dedicated upload-certificate verification passed; refreshed bundle is `output/store/furnio-production.aab`. Google upload remains pending. Source/build checks do not certify the still-disabled deletion processor. Awaiting owner answers on dedicated reviewer-account creation and separate exported/media backups.

### Release archive and reviewer contact — 14:30 EDT

Owner supplied the private Apple review contact; entered it and verified all four fields visually after reloading App Store Connect. Do not ask for those details again. Review-account credentials remain separate.

Added one shared, explicit AI-recipient/input disclosure to the existing single and batch confirmation dialogs, with an “Agree & create” action before submission. Demo paths remain labelled simulations. All 1,116 tests / 73 files and mobile TypeScript pass. Source app version is now 1.0.0.

`scripts/build-ios-store.mjs --production` creates a uniquely named archive using release Xcode 26.6 without changing the global Xcode selection. The first archive exposed the generated native version still being 0.1.0; the generated plist now follows MARKETING_VERSION and the script checks this before building. Corrected archive `output/store/Furnio-2026-09-10T18-28-23.683Z.xcarchive` passed codesign verification, production configuration, bundle identifier and 1.0.0 version checks. Store export is separate; no upload or submission is implied. `store/ExportOptions.plist` selects local App Store Connect distribution export, not upload.

### Owner confirmed rights; Apple validation checked

Owner confirmed content rights and requested submission. Saved Apple's affirmative third-party content-rights declaration and verified it on App Information. Clicked Add for Review: Apple returned **Unable to Add for Review**, requiring a build, reviewer Contact Information, privacy-policy URL, privacy-practices disclosures and age-rating answers. Added and saved `https://furnio.ai/privacy`; remaining declarations are not completed. No build is present in the version's Build section. Submission has not occurred. Reviewer contact details were not supplied by the confirmation; request the actual name/email/phone rather than infer them from account data.

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
