# Native Admin reporting

Implemented locally on 9 September 2026. **Disabled, unapplied and not deployed.** This is one part of the mobile plan, not certification of the app or its billing lifecycle.

## What the Administrator sees

An App store reporting panel below Overview's existing first row:

- A visible SANDBOX/production label and server-defined 30-day purchase window.
- Separate Apple/Google totals for every verified currency. CAD and USD are never added together or converted.
- Exact decimal purchase amounts, with unknown amounts excluded and counted explicitly. A verified zero remains zero, not unknown.
- Refunded amounts shown separately: these are purchases **inside the purchase window** that are currently refunded. They are not refunds issued during that window, net payouts, fees, tax reports or recognised revenue.
- Subscription access-state counts: active, trialing, grace, billing retry, scheduled cancellation and elapsed/missing-period reconciliation. Active does not imply a verified nonzero payment.
- An oldest-first, paginated follow-up list for delayed events (10+ minutes), quarantined events, spent-credit refund shortfalls, and expired/missing periods with a nonterminal status. Each button opens that exact customer's existing native billing/support panel; no Stripe invoice lookup is attempted.
- Loading, independently disabled, failure and refresh states. A failed report never becomes a zero balance or zero revenue total.

Pagination is 50 customers per page, using stable ordering within a snapshot. It is a live list, not a historical export: changing records can move between pages. Refresh/return to the first page when investigating a changing incident. Offset is bounded at 1,000,000.

## Existing Stripe behaviour

With the new Admin flags off, Overview's existing response, labels, arithmetic and layout remain unchanged. With both flags on, the existing MRR, collected revenue and paid-subscription labels explicitly say Stripe. The signup funnel's paid stage is labelled Stripe-only.

No native transactions enter Stripe IDs, invoice lookup, `purchase`/`subscription_grant` revenue sums or Stripe checkout. The native report reads one verified transaction per store ID, not webhook counts or ledger allocation rows.

The pre-existing estimated margin compares Stripe cash with shared processing costs. While native reporting is enabled, it is suppressed and marked unavailable rather than misrepresented as consolidated margin. Native MRR is deliberately **not guessed** from the last discounted purchase amount: current recurring prices are not yet stored/verified for that calculation. Existing Stripe dashboard row limits, mixed-currency assumptions and accounting limitations have not been silently rewritten.

## Access and isolation

1. `NATIVE_REPORTING_ENABLED=false` and `NATIVE_CUSTOMER_BILLING_ENABLED=false` in the Admin example environment; both must be explicitly enabled in isolated staging first.
2. New migration `20260909130505_native_admin_reporting.sql` adds only `private.native_commerce_settings.reporting_enabled=false`, three indexes and a read-only reporting function. No new customer table, ledger mutation, Stripe trigger or imaging Worker change.
3. The reporting function also requires the existing `customer_compatibility_enabled` flag and the server-configured environment. Request parameters cannot choose an environment or another Admin actor.
4. `GET /api/admin/native-reporting?offset=0` independently verifies the approved Admin identity, and the service-only RPC independently checks its active Admin record/role. Owner, admin, finance and support have read access. Public/customer roles cannot execute it directly.
5. Fixed empty database search path, explicit object names, bounded HTTP deadline, schema validation, sanitized errors and `Cache-Control: private, no-store`. Responses contain account UUIDs and counts—not raw events, receipts, emails, photos, provider secrets or store transaction identifiers.
6. The report's availability is independent of purchase reconciliation. Disabling this display must never stop processing already-paid transactions.

These choices follow [Supabase function security guidance](https://supabase.com/docs/guides/database/functions) and use [partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html) for outstanding operational records. No changes are made to Stripe tax or advertising configuration.

## Verification and limitations

- Admin unit/route/renderer tests: **82 tests across 14 files**; TypeScript, targeted lint and production build pass.
- Mobile regression checks: **625 tests across 38 files**, TypeScript and frozen contracts pass.
- Disposable, network-isolated PostgreSQL fixture: all 20 migrations, reporting access/gate/window/currency/duplicate/refund/state/pagination/redaction assertions and existing concurrent credit/purchase/deletion-fence tests pass. Only this run's own temporary container was removed. This is not full production-schema staging certification.
- Read-only deletion inventory remains at 122 tables. The new migration changes no account-data retention classification; its hash was added after review.
- Offline interactive fixture generator: `node scripts/preview-native-reporting.mjs`, output `output/playwright/native-reporting/index.html`. It compiles the real Admin components/styles with an injected synthetic API and `connect-src 'none'`. No real credentials or data.
- **Browser visual/interaction acceptance is still pending.** The current CLI browser refused local URLs with `ERR_ADDRESS_INVALID`; the generated fixture and renderer tests are not substitutes for observed desktop/phone rendering, pagination, customer-opening/focus and error/retry checks.

Remaining beyond this milestone: native Action Centre notification integration, richer subscription/payment reconciliation workflow, current-price/FX/fees-aware consolidated financial reporting if desired, automation audience compatibility, realistic full-schema staging tests, real sandbox store lifecycle tests and the broader mobile release gates. No production migration, flag, deployment, charge or paid model call was performed.
