# Native purchase recovery

Implemented locally on 9 September 2026. **Not deployed, not store-certified, and not authorization to enable purchases.**

## Customer experience

- Restore purchases asks the native store SDK to refresh ownership for the authenticated Furnio UUID, then asks our server to reconcile. It sends an empty JSON object—no user ID, price, credit amount or receipt assertion.
- Check purchase recovery reads status without opening another store sheet or queueing another scan.
- Existing credits remain available while recovery runs. The app distinguishes pending, review needed, no purchases found yet, not started, and reconciled available history.
- A very recent payment can precede RevenueCat history visibility. A completed scan is **not** proof that a new expected purchase has arrived. Exact intent-linked delivery confirmation and checkout locks are now implemented locally; see `NATIVE_PURCHASE_INTENTS.md`. Their operational resolution and real-store acceptance gates remain outstanding.
- Restore has a separate server readiness gate from new purchases. Acquisition rollback must not strand already-paid purchases. The native app still requires its correct public SDK key and authenticated identity.
- Staging uses Apple's/Google's actual sandbox with the platform's `appl_`/`goog_` public key. RevenueCat's separate `test_` Test Store is not accepted by this Apple/Google-only verifier.
- Account changes during the store operation reject the following reconciliation request. Configure RevenueCat restore behaviour to retain original ownership; no transfers or account merges are inferred.

## Endpoints

`POST /v1/purchases/reconcile`, JSON `{}`: existing customer authorization, environment derived from the Worker, begin/reuse a durable recovery coordinator, await queue acceptance, return status. Unknown request fields and query parameters are rejected.

`GET /v1/purchases/reconcile`: the same authenticated customer's status only. Neither route returns internal run IDs, cursors, leases, provider tokens or another customer's data.

Both require `NATIVE_RECONCILIATION_ENABLED=true`; neither enables checkout. Both remain available with `MOBILE_ENABLED=false`, so paid recovery survives an app-entry rollback. All flags remain **false** in checked-in configuration.

## Durable processing

1. One private coordinator per customer/store environment; repeated taps reuse it. Client-triggered re-enqueue is limited to once per minute. Completed scans have a one-minute cooldown.
2. A queue message holds only the recovery UUID. A transactionally claimed, ten-minute lease prevents simultaneous processors from advancing the same cursor.
3. Fetch one 20-item page from RevenueCat's authenticated `/v2/projects/{project}/customers/{Furnio UUID}/events` endpoint. Reconstruct the endpoint locally with the fixed project/account/environment. Never forward the secret to a provider-supplied pagination origin or another customer path.
4. Accept only supported purchase-event types with complete identity/product/transaction/period evidence. Unknown purchase types, missing fields, transfers, family-sharing and mismatched ownership require review. Unrelated customer metadata and other approved-project apps do not grant Furnio credits.
5. Store an explicitly sanitized event and stable namespaced hash. Subscriber attributes, raw receipts, raw response bodies, phone numbers and email addresses are not retained. Cursor advancement and inbox persistence are one database transaction.
6. Finish compatible history discovery **before** queueing recovered events. A later historical refund is therefore visible before an earlier subscription purchase is applied. Incomplete/incompatible history is held for review, not guessed.
7. Dispatch in bounded batches, advancing the dispatch cursor only after queue acceptance. Each event still passes independent RevenueCat purchase/subscription verification and the existing atomic native ledger function. Native transaction uniqueness prevents duplicate credits across webhooks, history, retries and reinstall restores.
8. Store refunds recover recoverable native credits; spent-credit shortfalls remain audited. A historical grant with a verified refund is applied and recovered atomically. Apple refund reversals now use independent server history and per-transaction revisions to restore only previously recovered credits. Ambiguous/unsupported evidence still requires review. See `NATIVE_REFUND_REVERSALS.md`; this remains disabled and awaits actual-store acceptance.

The local scan safety cap is 500 pages / 10,000 returned events. Histories exceeding that cap are explicitly review-required and do not dispatch partial grants. This is our safety bound, not a claimed RevenueCat limit. A compatible history finishing on exactly page 500 can complete.

Queue or database failure is not acknowledged as successful purchase delivery. A stale lease expires; retries resume from committed state. Queue/DLQ recovery tools and production monitoring still require operational acceptance. A later customer restore can re-enqueue pending work without making a new store purchase.

## Admin and privacy

The existing read-only native billing panel receives a `recovery_history_needs_review` warning even when no valid purchase row could be created. Coordinators still running after 30 minutes appear as `recovery_delayed`. Warnings are account-scoped, bounded to the existing 50-alert result, and behind the existing compatibility flags. No new advertising/analytics events are introduced.

The coordinator tables are private with RLS and no anonymous/authenticated access. Privileged RPCs are service-role-only. The Worker accepts no browser-origin requests, authenticates through the existing customer API service binding, and never logs bodies, tokens, customer IDs or provider URLs.

## Tests and remaining release gates

Local tests cover account/field tampering, environment isolation, metadata sanitization, pagination origin/path/cursor rejection, acquisition-disabled restore, account switching, status-only checks, durable ordering, queue failure, leases, duplicate callbacks/history, later-page refunds, incomplete histories, Admin warnings, exact/capped pagination, SQL privileges and existing ledger concurrency.

Still required:

- Real sandbox event bodies for both Apple and Google, including historical event-body variants, renewal/trial/refund/reinstall/account switching and provider-history retention behaviour. Documentation permits varying event bodies; unsupported shapes currently fail closed.
- Certify the implemented native purchase-intent/ledger linkage and cross-provider acquisition locks, and finish cancellation/unknown-launch resolution before checkout is enabled.
- Certify lifecycle upgrades, refund reversals, zero-price/promotional and pending transactions; do not assume history membership equals a new paid monthly grant.
- Complete-schema staging replay and all website regression gates; current SQL fixtures are synthetic and intentionally isolated.
- Physical-device store restore and background/poor-connectivity testing. No actual store account or financial operation was used in local tests.

Primary references checked: [RevenueCat customer resources](https://www.revenuecat.com/docs/api-v2/customer/resources), [subscription transactions](https://www.revenuecat.com/docs/api-v2/subscription), [webhook fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields), [Cloudflare queue retries](https://developers.cloudflare.com/queues/configuration/batching-retries/).
