# Native subscription-aware automation audiences

Implemented locally 9 September 2026. Disabled, unapplied to hosted databases, uncommitted and not deployed.

## What changes

When enabled, Find Customers and Select Customer read a bounded server-side cross-provider snapshot. The existing customer-subscription filters recognize Apple and Google subscriptions as well as the original Stripe customer subscription. Credit packs and developer-only subscriptions do not become customer subscriptions. Exact email, UUID and Stripe customer ID lookup remain available. Account status, registration age, both credit bounds, ordering and limits remain supported. No native transaction/family identifiers are returned.

The original `admin_customer_summary` view, Stripe `subscription_id`, `subscription_status`, package name and Stripe customer ID are untouched. Each new snapshot has an additional `billing` object with provider names, status list, recorded-subscription presence, native subscription count and reconciliation flag. For Each Customer retains it in the child context. Existing saved runs still parse without this object; they are not silently rewritten.

## Filter semantics

| Filter | Meaning with native compatibility enabled |
|---|---|
| No customer subscription | No recorded Stripe customer subscription and no native subscription record in the configured environment. This preserves the existing **never-recorded**, not **currently-inactive**, semantics. |
| Has any customer subscription | A recorded subscription with any of the three providers, including historical/terminal subscriptions. |
| Active / Trialing | Existing Stripe selection, or a corresponding native state whose verified period has not elapsed. |
| Past due | Existing Stripe `past_due`, or native grace period / billing retry. This is audience classification, not an entitlement grant. |
| Canceled | Existing Stripe `canceled`, or native expired/revoked. Scheduled cancellation before the paid period ends is not terminal. |
| Unpaid | Existing Stripe `unpaid`; no native status is falsely relabelled unpaid. Native billing retry is Past due. |
| Any | No subscription-state restriction. Other configured filters still apply. |

Multiple provider/family states remain in the additive list; a customer can match more than one status filter. An elapsed, nonterminal native subscription is explicitly marked for reconciliation and is **not** treated as a never-subscribed customer. This does not grant credits, activate services, cancel subscriptions, emit new subscription events or change pricing.

The existing Condition field `customer.subscription_status` remains Stripe-only. New `customer.billing.*` condition controls have **not** been exposed in Admin. Do not claim all existing manually authored billing conditions are automatically cross-provider. For current supported flows, use the subscription filter on Find Customers. Long waits preserve the original snapshot; a fresh selection/search is needed to check later state. A customer can still change state between a read and delivery—this reader is not an atomic campaign delivery/subscription lock.

## Isolation and rollout

1. Migration `20260909213457_native_automation_customer_billing.sql` creates one internal reader; no new table or existing view replacement. Source inventory remains 123 tables; the new hash was reviewed. Existing native per-user/environment index serves the correlated lookup. Full-scale query performance remains staging acceptance.
2. Only `service_role` may execute it. Public, anonymous and authenticated customer roles are explicitly revoked. Empty search path and static fully-qualified SQL; no dynamic SQL, caller-selected fields or unbounded result count.
3. Worker `NATIVE_AUTOMATION_BILLING_ENABLED=false` by default. Its independent `NATIVE_AUTOMATION_ENVIRONMENT=SANDBOX` must match database settings. Database `customer_compatibility_enabled` must also be true. A flag typo, environment mismatch or unavailable reader causes a redacted retry—not an empty audience or fallback to Stripe-only data.
4. Transport limits: HTTPS origin, no credentials/query/path overrides, redirect refusal, five-second deadline, streamed 1 MiB response cap, schema/unique-ID/count/exact-lookup checks. No response body or credentials in error logs.
5. Existing account-deletion filtering and final action fences are retained. Enable and certify the deletion guard separately before deletion is enabled. Repeat-protection keys are unchanged.
6. Apply to isolated staging first, enable database compatibility, deploy the flagged-off Worker there, then enable its native reader and verify dry-run audience IDs against synthetic Stripe/Apple/Google profiles. Do not route test flows to real recipients.
7. Before native sales launch, audit existing Stripe-only Condition nodes and queued/waiting campaign snapshots. Do not disable this reader as routine purchase rollback: already-paid native customers still require correct classification. Native reconciliation remains independent.

## Verified locally

- **72 Automation Worker tests / 6 files**, TypeScript and targeted lint pass.
- Generated binding types check and Wrangler dry-run build pass. No actual deployment.
- All **24** mobile migrations and existing concurrency cases pass the disposable Postgres suite. New SQL tests cover provider filters, no-plan/pack/developer/environment cases, terminal/stale states, overlap, credit/age/decimal bounds, exact lookup, invalid arguments, no mutation and real service/customer-role execution permissions.
- Engine tests cover Find/Select/For Each, empty-response no-fallback, deletion filtering and retry without taking an email-capable failure branch. Transport tests cover malformed/oversized/stalled responses and configuration errors.
- Only this run's own network-isolated, port-free fixture container was removed. No live API, database, email, webhook recipient, app build, paid model call or charge.

Real deployed REST/RPC, production-sized query plans, full-schema integration and owner acceptance are still required. Local fixture checks do not certify those gates.
