# Release gates — do not skip

Production is closed until every relevant gate is evidenced. No website tax or advertising changes are authorised by this work.

1. Separate mobile GitHub remote confirmed by owner; never push mobile code to furnio-main or Furnio Admin.
2. Staging Supabase, customer API, processing Workers and mobile API provisioned separately; no production secrets in test builds. No copying real customer data to staging.
3. Apple membership activated; Apple/Google account agreements and identifiers confirmed. Configure OAuth callbacks additively. Keep all existing web callbacks/providers.
4. Turnstile challenge approved HTTPS host; existing server action/hostname validation and SMS limits remain enabled. Test recovery, resend and logout on physical devices.
5. Website-only companion policy accepted for each storefront. Audit purchase CTAs and all outward links. Do not assume Apple approves Furnio's companion classification. No RevenueCat/store products, native checkout or restore in v1; see `WEB_PURCHASES_DECISION.md`.
6. Shared balance/history use existing customer billing rules without deploying deferred native-purchase functions. Audit the minimal mobile/privacy/device migrations separately; do not apply the historical payment rollout wholesale. Remove unused store SDK/config from release builds and verify the resulting native binaries.
7. Concurrent web/mobile spending, failed-job credit restoration, trial access, grants, website checkout and Stripe rollover behaviour pass unchanged. Returning to the app refreshes the real balance; no local credit grants or fake successful payments.
8. All nine service contracts and native inputs verified against deployed staging, including full-resolution masks, PDFs, furniture placements, batch limits, trial access and permanent watermarks. Paid FAL tests require owner approval.
9. Account deletion must revoke sessions/provider tokens and asynchronously remove media while retaining required financial audit. Existing website sessions must lose access. Deletion UI cannot launch against a placeholder endpoint.
10. APNs/FCM/Expo credentials, token cleanup, private notification payloads and signed-in deep-link ownership verified. Notifications never affect job processing.
11. Accurate privacy policy, photo-processing consent, Apple privacy disclosures, Google Data Safety and deletion URL approved. No advertising SDK included.
12. Physical-device QA, TestFlight/Play internal testing and owner acceptance completed before store submission and gradual rollout.

## Rollback

Disable mobile-only entry/support features when necessary; do not change website purchasing or remove shared credits/projects. Keep any in-flight work and necessary account-privacy processing safe. Never use destructive database rollback. Native commerce has never gone live and is deferred; no production reversal is needed. Preserve its local/staging code and records for reference, without enabling purchase flags.
