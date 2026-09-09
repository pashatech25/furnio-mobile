# Native backend — implemented boundaries and release gates

Updated 9 September 2026. This is local implementation evidence, **not permission to apply migrations or enable sales**. Website/Stripe operations remain independent.

## Implemented locally

- Immutable store-product → existing customer package-version mappings. Developer packages are rejected. Separate availability rows default hidden; store prices are never fabricated from website prices.
- Apple/Google subscription records and verified transactions separate from Stripe columns.
- Non-expiring native credit lots in the shared ledger. Original Stripe allocation runs first, remaining website credits next, then native lots in grant order.
- Source-preserving reservations and partial refunds for jobs, batches and pre-job API credit holds. No double spending across concurrent account sessions.
- Duplicate purchase/event/credit retry protection, including PostgreSQL BEFORE-trigger behaviour with `ON CONFLICT DO NOTHING`.
- Verified refunds recover only recoverable native credits. Spent-credit shortfalls are recorded for Admin reconciliation. If a failed job later returns revoked native credits, those recovered credits are reconciled without taking unrelated website credits.
- A signed webhook is checked against configured bearer authorization, HMAC/raw body, delivery timestamp, app IDs, store, account UUID and environment. Unknown attributes are stripped before persistence; raw bodies, receipts, email addresses and subscriber attributes are not stored.
- Durable sanitized event inbox → awaited Queue send → independent RevenueCat API verification → one atomic database apply. Permanent identity/product ambiguity is quarantined; outages retry. Queue messages contain an event ID or recovery-run UUID only.
- Authenticated purchase-history recovery with a leased, paginated coordinator. RevenueCat customer events are discovered before dispatch; compatible missed events reuse independent verification and the existing atomic ledger. No client payment claims are accepted. Recovered events and ordinary webhooks share the same transaction uniqueness. Known refunds are considered before a historical subscription grant. See `NATIVE_RECOVERY.md` for boundaries and staging gates.
- Current subscription state is revision-ordered; delayed events cannot overwrite newer cancellation state. Trial/status-only events do not grant paid credits.
- Billing reads distinguish all current providers, including unexpected duplicate subscriptions, and use shared ledger balance. Native credits never request a Stripe invoice.
- Activity reads use a stable `(created_at,id)` cursor, customer ownership predicates and bounded pages without prompts, provider IDs or storage keys.
- Native package photo allowances are resolved additively from immutable customer package versions. With compatibility disabled, the original website resolver runs unchanged. Verified paid native grants invoke the existing trial conversion, without unlocking earlier trial-watermarked images.
- Website billing can render an optional native block with fixed Apple/Google management links and source-labelled transactions. Native-only users are not shown a missing Stripe plan. A server check rejects a second monthly Stripe checkout for known native subscribers before Stripe/Focus/referral side effects; one-time web credit packs remain available.
- Read-only Admin native customer filters, provider badges, purchase details and pending/quarantined/refund-shortfall alerts. An unverified first purchase remains visible to support even before any native credit/subscription row exists. Actual store amounts/currencies are not mixed with Stripe revenue or assumed from catalog prices.

## Files and flags

Migrations live in the main repository, in this order:

1. `20260909042902_native_credit_reasons.sql` — enum values committed separately.
2. `20260909042919_native_commerce_foundation.sql` — schema and source-attributed ledger.
3. `20260909044746_native_commerce_events.sql` — sanitized inbox and atomic event apply.
4. `20260909050004_native_billing_read.sql` — catalog visibility and billing snapshot.
5. `20260909051332_mobile_activity_read.sql` — owned activity feed/index.
6. `20260909053256_native_customer_compatibility.sql` — photo allowances, paid trial conversion and optional native customer billing.
7. `20260909054645_native_admin_visibility.sql` — service-role-only native-aware customer filters and read-only purchase/reconciliation details.
8. `20260909063152_native_purchase_recovery.sql` — account-scoped leased recovery, durable cursors, refund awareness and read-only Admin recovery warnings.
9. `20260909065713_native_purchase_intents.sql` — cross-provider customer acquisition reservations, one-shot native launch, exact verified-transaction linkage, rollback guards and read-only pending-checkout alerts.
10. `20260909072646_native_checkout_support.sql` — unstarted selection recovery, role-gated candidate reads and audited linking to independently verified native payments; no credit grant or uncertain-checkout override.
11. `20260909074924_mobile_push_notifications.sql` — independent disabled device/outbox support.
12. `20260909081654_mobile_account_deletion_review.sql` — recent-auth shared-account deletion preflight.
13. `20260909083857_mobile_account_deletion_requests.sql` — durable request and receipt journal.
14. `20260909085813_mobile_account_cleanup_fence.sql` — disabled permanent work fence and media scopes.
15. `20260909100816_mobile_account_auth_block.sql` — sign-in block checkpoint, not completed deletion.
16. `20260909102539_native_stripe_checkout_recovery.sql` — service-only owned checkout recovery context.
17. `20260909113159_native_refund_reversal_reason.sql` — separate reversal ledger reason.
18. `20260909113200_native_refund_reversal_recovery.sql` — verified per-transaction financial revisions, exact recovered-credit restoration and native billing-history compatibility. See `NATIVE_REFUND_REVERSALS.md`.

**None has been applied to a customer database.** The original Stripe trigger is copied from its existing migration in tests, with SHA-256 recorded by the test runner. The new migration makes one guarded native-refund branch addition rather than replacing unrelated Stripe logic. This still requires a complete-schema compatibility review before deployment.

Worker default flags: `MOBILE_ENABLED=false`, `MOBILE_BILLING_READ_ENABLED=false`, `MOBILE_ACTIVITY_READ_ENABLED=false`, `NATIVE_RECONCILIATION_ENABLED=false`, `NATIVE_ACQUISITION_ENABLED=false`. Commerce/deletion/notification readiness are hard-disabled until their remaining release gates pass. Database acquisition, reconciliation and `checkout_protection_enabled` also default disabled, with no environment selected.

The existing customer API and Admin each add `NATIVE_CUSTOMER_BILLING_ENABLED=false`; the database independently adds `customer_compatibility_enabled=false`. No website frontend environment flag is necessary: its optional block is absent for non-native users. Existing Stripe `subscription` fields remain Stripe-only. Paid entitlements/compatibility must stay enabled for already-paid customers during a future acquisition rollback; stopping new purchases is a separate switch.

Paid-event reconciliation is intentionally independent of the app acquisition/entry flag. A rollback must stop new sales without abandoning already-paid transactions. Do not turn off reconciliation as the routine rollback mechanism.

Staging cannot use the recorded production Supabase project. A database with native transactions cannot switch its native environment. Sandbox and production require separate databases; never let sandbox receipts grant production credits.

## Verification

`pnpm test:ledger` creates a uniquely named, network-isolated, temporary Postgres container with synthetic data and no host ports/volumes. It does not read, stop or reset other Docker/Supabase projects. Cleanup verifies its ownership label before removing that run’s container.

The suite loads the original website Stripe allocation/rollover functions, applies new migrations, and tests native purchase/refund/idempotency, FIFO attribution, partial/late refunds, store-environment isolation, immutable mappings, RLS/function privileges, event atomicity, billing providers, pagination and concurrent spending/cross-account claims.

Type checks, Node-based unit tests and a Worker dry-run bundle are separate checks. None proves real Worker runtime, store account configuration, physical-device behaviour, a complete production-schema migration, or passing website end-to-end tests.

## Still required before purchases can be enabled

1. Certify the implemented restore/history backfill and exact purchase-intent linkage against actual sandbox customer-event payloads, store transaction identifiers, large histories, delayed visibility and queue/DLQ failures. A completed history scan alone does not prove a just-started purchase has arrived.
2. Certify the locally implemented Apple refund reversal handling (`NATIVE_REFUND_REVERSALS.md`), subscription transitions/upgrades and large-history pagination/rate limits. Older-period refund discovery remains a store-acceptance gate. Ambiguous events require review, not automatic credits.
3. Full-schema and deployed acceptance for the newly implemented shared customer entitlements and initial native-paid website/Admin visibility. Complete global reporting and automation audience compatibility; native identifiers must never be placed in Stripe fields.
4. Complete operational resolution and staging certification for the implemented cross-provider checkout/eligibility guards: cancelled native sheets, unknown Stripe creation outcomes, store-pending transactions, older unprotected sessions and audited duplicate-subscription follow-up. See `NATIVE_PURCHASE_INTENTS.md`; do not enable acquisition with unresolved launch-recovery UX.
5. Admin recovery for quarantined events/DLQ, unknown provider cancellations and global source-separated financial metrics. The customer panel now includes audited linking to an existing independently verified native purchase (`NATIVE_CHECKOUT_SUPPORT.md`); it is not deployed and cannot invent credits or release uncertain launched checkouts.
6. Real staging project, app identifiers, store products/prices and RevenueCat configuration; webhook signatures and independent verification against actual sandbox payloads.
7. Complete-schema migration replay, existing coupons/Focus/referrals/developers/trials/Stripe regression tests, physical-device purchase/restore tests and owner acceptance.

## References checked during implementation

- [RevenueCat webhook authentication and delivery](https://www.revenuecat.com/docs/integrations/webhooks)
- [RevenueCat event fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
- [RevenueCat API v2](https://www.revenuecat.com/docs/api-v2)
- [RevenueCat customer event history](https://www.revenuecat.com/docs/api-v2/customer/resources)
- [Cloudflare Queue acknowledgements and retries](https://developers.cloudflare.com/queues/configuration/batching-retries/)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

Recheck documentation and provider payloads before deployment; no store-approval or zero-risk promise is made.
