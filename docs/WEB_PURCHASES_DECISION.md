# Furnio Mobile — website-only purchasing

Owner approved 9 September 2026. **This supersedes native-commerce requirements in the original implementation plan and historical checkpoints.**

## Decision

- The native iOS/Android apps are free companions to Furnio. Subscriptions and credit packs are purchased only through the existing Furnio website/Stripe checkout.
- Keep the same authenticated customer, shared server credit balance, projects and nine service workflows. Do not change website prices, tax, credit expiry/rollover, trials, coupons or grants.
- No native purchase/restore/product catalogue, store credit grant, RevenueCat configuration or Google external-payment-link programme in v1.
- Use a read-only Credits screen, neutral zero-credit message, manual refresh and refresh when the screen is opened or the app returns to the foreground. Never grant credits locally or redirect automatically.
- For the initial companion implementation, the Credits screen has no external checkout link on any platform. A US-only Apple link can be considered separately after a trustworthy storefront check and policy review; do not infer eligibility from IP, device language or a user's address.

## Store constraints (reviewed 9 September 2026)

- [Apple guidelines 3.1.1(a), 3.1.3(b)/(f)](https://developer.apple.com/app-store/review/guidelines/#business): US storefront purchase links are permitted; Canada does not have that general exception. A free companion may qualify without IAP and without purchase CTAs; Apple's classification of Furnio is not guaranteed. Multiplatform classification can require IAP. Do not present this release strategy as pre-approved.
- [Google consumption-only guidance](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en): services purchased elsewhere can be used in the app. Direct purchase links have separate restrictions.
- [Google US external links programme](https://support.google.com/googleplay/android-developer/answer/16470497?hl=en): enrolment, APIs and reporting/fees apply; applicable fee/reporting requirements start 1 October 2026 per the current page. Website checkout linked from an app is not automatically fee-free.
- Audit all support/legal/account links before submission so they do not function as disguised checkout routes. Keep necessary privacy/support/deletion access. No hidden purchase link or review-only behaviour.

## What is simpler now

Remove from v1 acceptance: Apple/Google products and prices, RevenueCat keys/webhooks, native purchase delivery, restore, renewal/refund/grace-period testing, native-ledger rollout, cross-provider subscription locks, native Admin financial reporting and native-store financial disclosures.

The previously authored native-commerce code/migrations and tests remain preserved and disabled, not deleted or deployed. The RevenueCat package is retained only as a development dependency for deferred tests and is explicitly excluded from Expo native autolinking on both platforms. Its app plugin was removed; regenerated CocoaPods resolution and rebuilt iOS/Android artifacts exclude the store SDK. App routes no longer load its checkout module. Do not enable native billing compatibility or apply accumulated native-payment migrations to production simply because they were tested in staging.

## Still required before submission

1. Finish real staging authentication/Google/Apple callbacks and protected phone verification.
2. Finish isolated uploads/processing and all nine service tests, shared credit spend/refund and prompt parity. No paid generation without owner approval.
3. Wallet adapter is implemented and accepted against staging: authenticated GET `/api/billing`, shared balance, existing web subscription and recent purchased-credit grants, no store catalog or native-billing dependency. Production rollout/device acceptance still belongs to the release gate, not an automatic deployment.
4. Complete account deletion, financial/backup retention decision, optional push setup and device acceptance.
5. Audit the minimal mobile-only backend/schema changes needed for privacy/devices/recovery separately from deferred commerce. Regression-test the website; do not wholesale-deploy the old purchase plan.
6. Store-signed native builds, physical-device tests, privacy/support/reviewer materials, owner acceptance, TestFlight/Play internal testing and store review. Correct Google account and Furnio draft are verified; Play requires 12 testers for 14 continuous days. Apple account is not enabled for App Store Connect. See `STORE_SUBMISSION_STATUS.md`.

## Database and deployment boundary

Recorded mobile work has not applied migrations to the production database, nor deployed mobile billing changes to the production website/Admin/Workers. The separate `Furnio-Mobile-Staging` project (`bcrobmrimzkvfrnqarmv`) has 59 reviewed migrations, synthetic accounts and isolated Workers. Leave this staging history in place. No production rollback or database deletion is needed for this decision. Local Main/Admin compatibility edits are not the same as deployed production changes; preserve unrelated edits.

## Current implementation checkpoint

The wallet checkout/catalogue/restore UI is replaced by shared balance, existing subscription status and credit history. Demo billing shows website purchases. A source-level commerce guard also rejects store operations even if an old environment flag is true. Automatic refresh is scoped to the visible wallet and account-specific mounting is preserved. Current verification is recorded in `PROGRESS.md`; native visual/rebuild acceptance is separate.
