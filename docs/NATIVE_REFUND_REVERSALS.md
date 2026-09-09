# Native refund reversal recovery

Updated 9 September 2026. Implemented and tested locally; disabled, unapplied and not store-certified. This is one part of the approved mobile plan, not a launch-completion claim.

## Customer behaviour

If Apple reverses a refund, restore only native credits Furnio actually recovered from that original transaction. Preserve its original non-expiring credit lot and spending order. Never issue a second purchase/monthly grant, convert restored credits into website credits, change Stripe rollover, restart automatic renewal, or charge a customer.

Example: a customer purchases 20 native credits and spends 5. A refund recovers the remaining 15 and records a 5-credit shortfall for Admin. A verified reversal restores 15, resolves that refund shortfall, and leaves the already spent 5 spent. If those 5 were instead reserved for a job that later fails, the normal job refund returns them to the original lot once.

## Independent evidence

The signed/authenticated webhook is durable ingress, not sufficient reversal proof. The mobile Worker additionally fetches RevenueCat's owned purchase/subscription transaction and complete bounded customer event history. It requires exact account, app, environment, store, product, original transaction, purchase time and nontrial identity. Apple consumable status must also be `owned` before restoration. A current active subscription alone does not prove a historical refund reversal.

All relevant history pages are examined before applying the newest refund/reversal revision. Opposite states at the same timestamp, inconsistent identities, family sharing, unsupported stores and trial reversals require review. Missing history or a still-refunded consumable status retries without restoring credits. No raw history, subscriber attributes, payment credentials or receipt bodies are persisted.

Bounds: 12 pages per lookup, 100 entries per page, 40 total RevenueCat reads per verification, 512 KiB per response and 12-second request deadlines. Histories beyond the bound fail closed and eventually enter existing queue/DLQ follow-up; they are **not** fully supported by pretending the first page is complete. Scalable historical lookup/certification remains a release gate.

## Accounting and order

- Revisions are keyed to the exact original transaction, not the subscription family.
- A common account transaction lock serializes web/mobile spending, job refunds and native state changes.
- Event completion, any missing original grant and the refund/reversal adjustment commit atomically.
- Older revisions cannot overwrite a newer refund/reversal. Same-state duplicates produce no extra ledger entries. A newer genuine refund after a reversal can recover the available native credits again.
- Reversal credits use `native_refund_reversal`, refer to the original lot/transaction, and retain original FIFO rank. Reserved/spent credits are not restored again.
- Refund during a running job remains source-preserving in either arrival order. No negative shared balance or use of unrelated web credits to cover a native shortfall.
- Cancellation/current subscription state remains separate from historical payment restoration. Another month's grant is not touched.
- After a transaction has a versioned refund state, the legacy unversioned refund RPC cannot bypass it. Deploy/retain the matching verification Worker for reconciliation.
- Website/API billing parsers and native-only transaction readers recognize the new reason, show Apple attribution and never offer Stripe invoices for it. Existing non-native customer behaviour is unchanged.

The private `native_refund_revisions` journal stores state, revision, evidence ID, accounting delta and timestamps with a financial-record FK. Account deletion must retain only the approved minimum accounting/audit linkage under an explicit retention policy. This migration does not enable automatic deletion or decide a legal retention duration.

## Source and migration files

Mobile: `backend/src/refund-state.ts`, `backend/src/revenuecat.ts`, their unit tests, `backend/tests/refund-reversal-cases.sql`, and concurrency cases in `scripts/test-ledger.mjs`.

Furnio main (both **unapplied**, created through the local Supabase CLI):

1. `20260909113159_native_refund_reversal_reason.sql` commits the enum value separately.
2. `20260909113200_native_refund_reversal_recovery.sql` adds state revisions, atomic recovery and native billing-history compatibility. The original Stripe accounting function is not changed by this migration.

Apply only through the approved isolated staging/full-schema rollout, after previous mobile migrations and matching API/web compatibility readers. Keep acquisition disabled until the complete store lifecycle and website regression gates pass. No live migration, Worker deployment, purchase, refund or paid model call was performed for this work.

## Verified locally

- Provider tests cover independent reversal evidence, missing/stale/mismatched history, all-page ordering, unsupported trial/Google reversals and expired historical subscriptions.
- Synthetic PostgreSQL cases cover partial/full recovery, zero recoverable credits, both job-return orders, newer re-refunds, duplicates, reversal-before-original, exact monthly attribution, billing labels and restricted RPC privileges.
- Two-connection tests cover duplicate reversal delivery, competing refund/reversal revisions and simultaneous native credit spending.
- The same disposable fixture also runs prior Stripe priority/rollover, cross-provider checkout, source-preserving refunds and account-fence regressions. It does not access any customer database.

## Remaining acceptance

Verify actual RevenueCat sandbox event shapes, Apple reversal delivery, subscription transaction identities, historical refund coverage, rate limits/retention, store restore, queue outages and physical devices. RevenueCat documents that subscription cancellation refund webhooks cover only the latest period; discovery and independent accounting for refunds of earlier periods must be certified rather than assumed. Configure store server notifications and verify coverage before release. Google reversals are not documented as a supported event and are not automatically restored by this code.

Official references checked for this implementation:

- [RevenueCat event types and store support](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
- [RevenueCat subscription transaction API](https://www.revenuecat.com/docs/api-v2/subscription-transactions)
- [RevenueCat REST API](https://www.revenuecat.com/docs/api-v2)
- [RevenueCat webhook verification](https://www.revenuecat.com/docs/integrations/webhooks)
