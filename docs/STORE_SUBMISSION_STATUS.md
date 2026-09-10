# Furnio store submission status

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
