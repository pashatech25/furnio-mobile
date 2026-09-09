# Recovering an interrupted website checkout

Implemented locally on 9 September 2026. **Disabled, unapplied and not deployed.** This is part of mobile/web purchase compatibility, not a replacement for Stripe billing. Prices, tax settings, ordinary coupons, referral rules and image processing remain unchanged.

## Customer experience

When the native billing compatibility flag is enabled, website **Credits & plan** includes **Recover earlier checkout**. It checks the original payment session without creating another checkout or navigating automatically.

- **Open:** shows **Continue original checkout**, preserving its original plan and offer. It is not a new purchase request.
- **Complete:** explains that payment can still be processing and credits follow verified payment confirmation. No second payment is requested.
- **Expired:** Stripe independently confirmed that the old checkout expired; the existing purchase-intent function records this and permits a new selection.
- **Pending / needs review:** leaves the purchase lock intact and asks the customer to retry the check or contact support. A missing search result is not proof of no charge.
- **None:** no protected pending website checkout was found. This is not a statement that the account has no payment or subscription.

Checkout return URLs and transport errors no longer claim “Nothing was charged” without evidence. Recovered links are displayed only for the account that requested them, including during account switching.

## Server checks

1. `POST /api/billing/checkout/recover` requires the existing verified customer session. The body is exactly `{}`, capped at 1 KiB; query/body account IDs, payment IDs and other selectors are rejected. Responses are `no-store`.
2. Service-only `get_stripe_checkout_recovery(uuid,text)` reads the authenticated customer's current protected subscription intent and server-stored Stripe customer ID. It is read-only, uses no customer email matching, rejects inactive accounts and mismatched environments, and grants no table access to clients.
3. A stored session ID is retrieved directly. If creation succeeded but the ID response was lost, Stripe is queried for that server-known customer, from five minutes before the recorded launch. Each page contains at most 100 sessions; discovery stops after three pages. Calls use a seven-second timeout without SDK network retries.
4. A candidate must match the exact intent UUID, Furnio user UUID in both ownership fields, immutable package version, Stripe customer, subscription mode, launch window and live/test environment. Discovery must finish without duplicates or ambiguity before accepting a candidate. The session is then retrieved and checked again.
5. Only independently checked evidence reaches the existing `record_stripe_purchase_intent` function. Recovery does not create a Checkout Session, replay a create request, grant credits, charge, refund, or cancel a subscription. Completion remains under the existing Stripe payment/webhook logic.
6. Open-session URLs must use Furnio's current Stripe-hosted HTTPS Checkout origin. A future custom billing domain requires an explicit allowlist change and tests; it is not accepted implicitly.

Stripe supports customer/date filters and cursor pagination, but not a Checkout metadata search filter, so matching is performed after the bounded customer-scoped read. A complete Checkout Session can still have payment processing in progress. See the [Stripe list API](https://docs.stripe.com/api/checkout/sessions/list) and [session retrieval API](https://docs.stripe.com/api/checkout/sessions/retrieve).

## Focus compatibility

An uncertain **protected** checkout creation keeps its account-bound Focus offer reserved. The explicit Focus release endpoint refuses to release an offer with no session ID while a protected Stripe subscription intent is reserved/launched. Legacy unprotected flows retain their previous behaviour.

Recovery reattaches an open session only to the original matching Focus reservation. A released offer or a different recorded session requires support review; it never generates another coupon. Independently verified expiration can release that original offer. Completed sessions remain with the existing paid-invoice webhook.

## Boundaries and release gates

- No matching session, a scan exceeding 300 entries, conflicting evidence or provider/database failure keeps the lock. No time-based override, balance manipulation or client cancellation assertion is accepted.
- An open checkout can be continued; this endpoint does not forcibly expire it. The existing known-session Focus cancellation path is separate.
- Apple/Google cancelled or unknown launches without provider evidence are **not solved by this Stripe recovery**. Those remain release blockers, as do real-store lifecycle tests and operational exception handling.
- Requires `NATIVE_CUSTOMER_BILLING_ENABLED=true` and the existing database protection/compatibility gates. All remain disabled here. Acquisition remains code-blocked.
- Main migration `20260909102539_native_stripe_checkout_recovery.sql` adds one service-only read function, no new tables/columns. The source inventory remains 120 tables. It is the sixteenth unapplied mobile migration.
- Rollback must preserve processing/reconciliation of existing paid and pending obligations. Do not delete purchase records or reverse migrations as routine rollback.

## Verified locally

API unit/route tests cover flags, authenticated ownership, strict/oversized requests, pagination, ambiguity, missing matches, fresh retrieval, live/test isolation, package matching, redirect restrictions, errors and Focus protection. SQL tests cover exact-owner context, inactive/environment rejection, read-only behaviour, saved-session recovery, expiration and role privileges. No real Stripe calls, customer data, charges or production changes were used.

Before rollout, validate against a full-schema isolated staging project and Stripe test-mode Checkout (including lost response, webhook delay, Focus/referral/ordinary promotion, cancellation and expired-session scenarios). Production key permissions and actual deployment IDs are not certified by these fixture tests.
