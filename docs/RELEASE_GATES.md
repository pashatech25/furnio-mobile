# Release gates — do not skip

Production is closed until every relevant gate is evidenced. No website tax or advertising changes are authorised by this work.

1. Separate mobile GitHub remote confirmed by owner; never push mobile code to furnio-main or Furnio Admin.
2. Staging Supabase, customer API, processing Workers and mobile API provisioned separately; no production secrets in test builds. No copying real customer data to staging.
3. Apple membership activated; Apple/Google account agreements and identifiers confirmed. Configure OAuth callbacks additively. Keep all existing web callbacks/providers.
4. Turnstile challenge approved HTTPS host; existing server action/hostname validation and SMS limits remain enabled. Test recovery, resend and logout on physical devices.
5. RevenueCat project, authenticated webhook secret and native public SDK keys configured. Supabase UUID identity, no anonymous purchases, unsafe receipt transfers disabled. Store products, price points (including high-priced tiers), quantities, Canada/US availability, CAD conversions and fees approved by owner.
6. Shared native credit accounting, web/admin provider compatibility and overlapping subscription protection implemented and tested in staging BEFORE activating a store product. Existing Stripe rollover behaviour must pass unchanged.
7. Purchase replay, server verification, refund shortfalls, native lot attribution, restore/account switching and concurrent web/mobile spending pass integration tests.
8. All nine service contracts and native inputs verified against deployed staging, including full-resolution masks, PDFs, furniture placements, batch limits, trial access and permanent watermarks. Paid FAL tests require owner approval.
9. Account deletion must revoke sessions/provider tokens and asynchronously remove media while retaining required financial audit. Existing website sessions must lose access. Deletion UI cannot launch against a placeholder endpoint.
10. APNs/FCM/Expo credentials, token cleanup, private notification payloads and signed-in deep-link ownership verified. Notifications never affect job processing.
11. Accurate privacy policy, photo-processing consent, Apple privacy disclosures, Google Data Safety and deletion URL approved. No advertising SDK included.
12. Physical-device QA, TestFlight/Play internal testing and owner acceptance completed before store submission and gradual rollout.

## Rollback

Disable new mobile purchases/entry via server flags, not credit ledger deletion. Continue handling verified paid events and reconciliation. Keep checkout protection and native billing information readable in the website/Admin even when acquisition is disabled. Never use a destructive migration rollback to undo a release. Before enabling acquisition, finish the audited cancelled/unknown-launch resolution workflow and inventory older unprotected Stripe sessions; see `NATIVE_PURCHASE_INTENTS.md`.
