# Explicit SDK cancellation recovery

Implemented locally 9 September 2026. **Disabled, unapplied, not certified against Apple/Google sandbox.** No production purchase, refund, deployment or database change was performed.

## Customer behaviour

An explicit RevenueCat `PURCHASE_CANCELLED_ERROR` is saved as a minimal enum in the existing encrypted, account-scoped journal. Only this outcome can request `POST /v1/purchases/intents/:id` with `{ "action": "store_cancelled" }`.

The server first checks the exact owned intent. A previously verified or cleared result is returned immediately. Otherwise, a private database lease allows a bounded fresh RevenueCat read of this customer's subscriptions, purchases and event history. Existing/pending subscriptions (for subscription checkout), recent purchases/events and ambiguous ownership prevent release. Old purchases alone do not prevent retrying a cancelled pack.

A final database transaction takes the existing per-account purchase lock. It rechecks the lease, environment, state, transaction hint, verified deliveries, received events and current subscription records. Only an eligible checkout with a clear provider snapshot is marked cancelled. The check result, timestamps and attempt count are retained. No financial record is deleted or altered and no credits are granted, refunded or expired.

The app clears its device journal only after the exact server status permits it. A lost response retains the journal; recovery can read the committed result later. No recovery action reopens the store sheet. A subsequent purchase requires a new explicit selection and request ID.

Pending approval, already-owned errors, unknown failures, interrupted launches and conflicting transaction hints **do not use this release path**. They keep the original protection and exact payment-recovery workflow.

## Honest risk boundary

The SDK report is customer-controlled context; an empty RevenueCat snapshot is **not cryptographic proof that no charge exists**. This is a practical accidental-double-purchase safeguard, not an adversarial guarantee of global exclusivity across stores. RevenueCat/store propagation and external store actions can race these checks. Do not label the audit as a provider-confirmed refund or absence of payment.

RevenueCat documents that Apple can return cancellation for an already-owned product. This is why the fresh ownership/subscription/history checks are required. Incompatible, incomplete, oversized, excessive-page, inaccessible or rate-limited responses never clear a checkout. The existing verifier limits apply: fixed origin/project/customer, bounded bodies, at most 12 pages per collection and 40 total requests, and a two-minute database lease. A finished attempt has a ten-second cooldown. No receipt, raw error, account email, token or provider secret is retained in cancellation evidence.

The SDK’s cancelled classification, store-history availability and propagation behaviour must pass signed sandbox/device acceptance before this independently disabled flag can be enabled. A determined caller can falsely report cancellation; doing so cannot fabricate credits but could defeat an accidental-acquisition guard before a genuine payment becomes visible. The complete release also needs cross-provider obligation monitoring described in the main plan.

## Late payment visibility

Verified paid events remain independent of purchase-intent state. A payment arriving after cancellation is still recorded exactly once and receives its legitimate shared credits through the existing server verifier/ledger.

Admin customer details → Native billing → Interrupted checkouts includes a read-only timing-overlap warning. It correlates a matching store/product/account payment whose purchase time falls within the cancelled launch window and whose verification occurred after release. It shows internal Furnio references, package, credits and dates—never store tokens or receipts. Current active owner/admin/finance/support roles can read it; customers and anonymous users cannot call the privileged function. No refund or relaunch button is offered.

This is a review signal, not proof of a duplicate charge. Up to 20 matches are shown. Payments with a later store purchase timestamp cannot be conclusively attributed to the earlier cancelled sheet and may not appear in this narrow warning; global duplicate-provider obligation reporting remains a separate release gate.

## Files, flags and rollback

- Main migration: `20260909121424_native_sdk_cancellation_recovery.sql`, following the previous eighteen mobile migrations. **All nineteen remain unapplied.**
- Database `sdk_cancellation_recovery_enabled` defaults to `false`; existing checkout protection and reconciliation must also be enabled for the matching environment.
- Existing Worker `NATIVE_RECONCILIATION_ENABLED` gate remains. Acquisition/capabilities remain disabled. No new public secrets or client authority fields.
- Deploy the additive migration before the corresponding Admin read route during an approved staging release. An unavailable alert read reports an error rather than silently claiming no issues.
- Rollback can disable cancellation recovery and new acquisition. Keep processing paid events; never delete journals/audits/transactions or reverse migrations as routine rollback.
- The cancellation-check table is classified in the account-deletion financial/audit retention inventory. Its actual retention policy still needs approval; it is not exempt from privacy obligations.

## Local verification

- 587 mobile/backend unit tests across 35 files, mobile/Worker TypeScript, frozen customer contracts and source inventory checks passed.
- Disposable, network-isolated PostgreSQL 17 replay of all nineteen migrations passed. Tests include disabled gates, ownership/environment/privileges, leases/cooldown, duplicate release, no credit change, existing Stripe compatibility, late delivery, received-event conflicts and read-only Admin warnings. Independent connections verify one cancellation lease and one release.
- 63 Admin tests, TypeScript, targeted lint and local production build passed. Phone/tablet offline screenshots were inspected with document widths matching 390px and 768px, and no browser errors/warnings. The existing verified-payment link remains a separate explicit audited action.
- Local mobile Worker dry-run build passed: 634.58 KiB, 99.27 KiB gzip. No upload/deployment.
- Fresh unsigned iOS simulator Release build/configuration check passed (`output/ios-simulator-2026-09-09T12-25-36.904Z.log`). Installed and launched in Furnio Mobile QA; the demo welcome screen was inspected (`output/ios-cancellation-build-startup.png`). Actual-store cancellation and physical-device purchases remain untested.

Sources: [RevenueCat error handling](https://www.revenuecat.com/docs/test-and-launch/errors), [RevenueCat customer resources](https://www.revenuecat.com/docs/api-v2/customer/resources), [Supabase database functions](https://supabase.com/docs/guides/database/functions). These inform the implementation; they do not replace real store transaction evidence.
