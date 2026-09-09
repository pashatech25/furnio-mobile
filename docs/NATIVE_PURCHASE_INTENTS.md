# Customer purchase intents and checkout protection

Updated 9 September 2026. Implemented locally, **disabled, unapplied and not certified for customer use**. This is an additive layer; Stripe still owns website payments and RevenueCat coordinates Apple/Google purchases. Website tax settings, ads, imaging Workers and prompts are unchanged.

## What the new layer does

1. A verified customer selects an immutable native product, or the website selects a customer package version.
2. The server reserves a purchase intent under the same per-account PostgreSQL transaction lock used by native ledger delivery. A unique partial index is a second line of protection.
3. A subscription reservation excludes concurrent Stripe, Apple and Google subscription checkout for that account/environment. Existing active, trialing, past-due, incomplete, unpaid or paused customer Stripe subscriptions and non-expired/non-revoked native subscriptions also block acquisition. Developer plans are not customer subscriptions. Packs do not prohibit legitimate subscription ownership; the same native pack cannot have two unresolved launches.
4. The app saves its request ID and intent in account/environment/store-scoped Keychain/Keystore storage **before** each irreversible step. No receipts, purchase tokens or raw store JSON are stored in this journal.
5. Launch consumes a one-shot permission. A repeated launch returns a conflict; it never authorizes another sheet.
6. A returned store transaction ID is only a lookup hint. Confirmation requires an independently verified transaction belonging to the same user, store, environment and immutable product, purchased after launch, with its delivered ledger lot. Credit grants still happen only through the verified native event processor.
7. The app reports `verified` for this specific payment only after that match. A completed account-history scan (`synchronized`) is not a substitute.

## State and interruption rules

| State | Meaning | Safe next step |
| --- | --- | --- |
| Reserved | Server accepted selection; store cannot have been opened by this intent | One launch, explicit cancel before launch, or ten-minute reservation expiry |
| Launched / pending | Store payment may have started | Check exact transaction, restore history, or support review; no automatic reopening |
| Settled / verified | Independent server evidence and native credit delivery matched, or Stripe subscription reconciliation matched | Show provider-specific history; existing subscription still prevents another provider |
| Cancelled / expired | Unlaunched reservation cancelled/expired, Stripe verified expiration, or explicit SDK cancellation passed the separately gated server risk checks | New explicit purchase selection, with a new request ID |

A local timeout, app termination, browser cancel URL, or client assertion of failure cannot automatically expire a **launched** payment. Pending/uncertain launches older than 30 minutes appear in the existing read-only Admin customer billing alerts, even when no payment event has arrived.

The app persists a redacted SDK observation and displays a saved-checkout recovery card. Check recovery can start the existing bounded history scan without opening a payment sheet, and Restore preserves exact-intent verification semantics. See `NATIVE_CHECKOUT_UX.md`. A subsequent independently disabled SDK-cancellation path can now release an eligible selection after fresh server checks; see `NATIVE_CANCELLATION_RECOVERY.md`. Unknown/pending payments are excluded.

Unstarted selection recovery and audited Admin linking to an existing independently verified native payment are implemented; see `NATIVE_CHECKOUT_SUPPORT.md`. Lost Stripe creation responses have an exact-account bounded session lookup; see `STRIPE_CHECKOUT_RECOVERY.md`. **Remaining release blockers:** actual-store certification of the SDK cancellation policy, unresolved unknown/pending launches, conflicting hints, global cross-provider obligation follow-up and Stripe requests without a uniquely verifiable session. Do not enable acquisition with unfinished resolution workflows. Do not tell customers to edit SQL, delete payment records, or repeatedly buy to resolve them.

## HTTP contract

All endpoints reject browser Origin access, use existing verified-customer authorization, accept bounded JSON and never accept a client-selected user ID/environment/price/credits.

- `POST /v1/purchases/eligibility`: `{store: "APP_STORE" | "PLAY_STORE", productId, requestId: UUID}`. Returns `{enabled:true, allowed:true, intentId, expiresAt}` or `{enabled:true, allowed:false, reason}`. Reasons: `existing_subscription`, `purchase_pending`, `request_already_used`. Internal Stripe session IDs are stripped from mobile responses.
- `POST /v1/purchases/intents/:id`: `{action:"launch", store}` consumes the launch permission; `{action:"report", transactionId}` records a lookup hint; `{action:"cancel"}` cancels only an unlaunched native reservation.
- The same route now accepts exactly `{action:"store_cancelled"}` for the SDK-reported cancellation risk check. No account/environment/store/evidence/price fields are accepted. The server derives context and independently checks RevenueCat before final database reconciliation; returned status is unchanged.
- `GET /v1/purchases/intents/:id`: account-scoped status. Responses contain only `intentId` and `status` (`reserved`, `pending`, `verified`, `cancelled`, `expired`). Reports/status continue during acquisition rollback.
- Existing account-level `POST/GET /v1/purchases/reconcile` contracts are unchanged.
- `POST /v1/purchases/recover-selection`: account/store/request-scoped recovery after a lost eligibility response. It can cancel an unlaunched reservation but never a launched checkout. See `NATIVE_CHECKOUT_SUPPORT.md` for its delayed-request limitation.

## Website compatibility

`apps/api/src/lib/customer-purchase-intent.ts` integrates only the customer monthly checkout route. The deployment flag off performs zero extra RPC calls; the database protection gate off returns the existing checkout path. One-time website top-ups bypass this layer. Developer checkout and existing Stripe plan changes remain separate.

Protected Stripe sessions carry `furnio_purchase_intent_id` alongside existing metadata. The helper validates server-returned owner, intent, mode and live/test environment before recording or resuming a session. It resumes only the exact same request, not another device's different package/discount selection. A different request can proceed after independently observing the previous session `expired`. A complete session stays protected until its matching customer subscription is reconciled. No local timer substitutes for Stripe session status.

Focus, referral and promotion selection remains in the existing route. A pre-rollout open Focus session is not reattached to a new intent or stripped of its benefit. Real Focus/referral/Stripe regression testing is still required in staging.

## Flags, migration and rollback

- Migrations: main repo `20260909065713_native_purchase_intents.sql`, after the preceding eight native migrations, followed by `20260909072646_native_checkout_support.sql`. None applied to customer databases.
- New Worker flag `NATIVE_ACQUISITION_ENABLED=false`. `commerceReady` and returned catalog `acquisitionEnabled` remain hard-disabled until all commerce release gates pass.
- New database flag `checkout_protection_enabled=false`; native acquisition requires protection, shared customer compatibility and reconciliation together.
- Keep protection/compatibility/reconciliation active for existing paid or pending obligations. The database rejects removing checkout protection while a launched payment or current native subscription exists. Rollback disables **new acquisition**, not financial evidence or paid credit delivery.
- A database with purchase intents cannot switch native environments. Stripe live/test mode is derived from its existing server `STRIPE_RESTRICTED_KEY`, not from client input.

## What this cannot guarantee

Apple/Google storefronts, existing auto-renewals and administrator/provider-side actions cannot participate in Furnio's SQL transaction. These locks protect the Furnio-controlled acquisition paths; they do not claim global, zero-risk exclusivity over external stores. Reconciliation must still detect and expose duplicate obligations without hiding payments or deleting credits.

Before cutover, inventory and reconcile/expire older subscription Checkout Sessions and ensure all customer acquisition entry points use the shared protection gate. A previously issued unprotected session cannot be retroactively locked by merely deploying this code.

Still required: actual Apple/Google transaction-ID format/date matching, store cancellation/pending/restore behavior, pricing/products, full-schema staging replay, operational resolution, duplicate-provider follow-up and physical-device acceptance. No live charges or paid generation tests were used here.

## Local checks

The synthetic PostgreSQL suite now replays nineteen additive migrations, existing Stripe credit functions, subscription/pack reservations, replay and identity rejection, no client grant, stale transaction rejection, Admin visibility/linking, read-only Stripe recovery context, safe rollback, native refund revisions, SDK cancellation checks/late-payment warnings and independent two-connection reservation, launch, recovery and cancellation-lease races.

App tests cover persist-before-launch, storage failure, restart recovery, lost launch response, client cancellation, account switch during store payment and rejecting history-level success as exact-purchase confirmation. API tests cover flags, provider ownership, verified Stripe expiration, bounded requests, and no “no charge” assertion after uncertain protected checkout creation.

Sources checked: [Stripe session expiration](https://docs.stripe.com/api/checkout/sessions/expire), [Stripe session creation](https://docs.stripe.com/api/checkout/sessions/create), [Supabase database functions](https://supabase.com/docs/guides/database/functions). Installed RevenueCat SDK transaction/result type definitions are used; real store payload acceptance is still pending.
