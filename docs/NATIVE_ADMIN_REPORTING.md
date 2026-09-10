# Native Admin reporting

**9 September, 15:04 Toronto:** read `NATIVE_SUBSCRIPTION_OVERLAPS.md`. Version-2 read-only overlap signals and provider counts now feed this report/Action Centre; unknown Stripe mode is explicit. Admin **102 tests / 16 files**, TS/lint/build pass. With owner permission, all **22 mobile migrations** and overlap/concurrency cases pass the isolated SQL suite. New warning desktop/mobile file-based visual/interaction checks pass. No production changes. Docker auto-resumed the existing LiveBy-Rep stack; await the owner's separate shutdown choice.

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
- An Action Centre warning with global signal/account counts, explicitly labelled Sandbox where applicable. Database configuration mismatches and unavailable reads have their own warnings, not false zero-issue results. Existing Overview monetary calculations remain Stripe-only.
- Desktop's notification button and a rollout-gated mobile hamburger-menu Action Centre entry open the report, scroll below the sticky header and move focus to its named section. The four existing mobile header shortcuts are unchanged. Ordinary navigation resets this deliberate focus request.

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
- **Offline browser component acceptance passed after the restart** (9 September, about 10:09 Toronto). Chrome DevTools inspected the actual bundled components at 1280×900, 390×844 and 768×1024; an additional 320×700 check found no horizontal overflow and a minimum 44px reporting-button height. Desktop, phone, customer-detail and tablet screenshots were inspected inline. This is not authenticated full-Admin or native-device acceptance.
- The 51-customer synthetic dataset produced 50 rows on page one and the exact final customer on page two; Previous returned to the first 50. Opening customer `00000000-0000-4000-8000-000000000451` called only that synthetic customer's native-billing/native-checkout adapters, focused the selected panel, and closing restored focus to its originating button. USD 2.50, CAD 4.25 and CAD 5.75 remained separate. A simulated outage removed money cards and displayed an unavailable alert; restoring the fixture and refreshing recovered the report without substituting zero totals.
- Visual QA found uneven mobile pagination wrapping. A scoped CSS rule now places Previous/Next on the same row, with the page caption below; this was rechecked at 390px and 320px. No billing logic, migration or processing endpoint changed.
- The isolated test tab's network log contained only the local HTML and JavaScript requests; console error/warning checks were empty. API calls were injected in-memory fixture responses, with `connect-src 'none'`. No Stripe, RevenueCat, customer credentials or live database was used. The initial screenshot save outside the browser tool's workspace scope was denied; screenshots were inspected inline instead, without bypassing that restriction.

## Action Centre integration — 10:31 Toronto

The existing reporting RPC is reused by a server-only loader; no new SQL or flags were added. Overview supplies its independently authenticated Admin actor, calls the loader only with both native rollout flags enabled, and caps this auxiliary read at three seconds. The paginated endpoint retains its 15-second deadline, authorization, strict query validation and private/no-store responses. Transport/SQL/schema errors are redacted before reaching either route. Native report failure does not make the existing Stripe Overview unavailable. Signal totals come from the RPC's global totals, never a sum of the first 50 customers.

Admin unit tests now include the real Overview route and the shared loader: **96 tests across 16 files** pass, covering authorization-before-query, either rollout flag off, authenticated actor, deadline selection, global counts, sandbox labels, database-disabled state, redacted failures and unchanged Stripe values. TypeScript, targeted reporting/route lint and the final production build passed at about 10:34 Toronto. Full `admin-app.tsx` lint still reports the command-filter `react-hooks/refs` error and missing `search` dependency warning. Running the committed HEAD file through ESLint on stdin reproduced the same two diagnostics without modifying any files; these pre-existing command-search issues were not changed or suppressed. No query was run against a live database; the previous isolated SQL pass is unchanged and was not rerun with Docker stopped.

`node scripts/preview-native-actions.mjs` builds the actual Admin shell, Overview, Action Centre and native reporting/customer panels with synthetic in-memory auth/API. Unrelated feature tabs and `next/image` are stubbed. A CSP with `connect-src 'none'` prevents external requests. Chrome QA at 1280px and 390px confirmed Customers → Action Centre → report, dialog/menu closure, report focus/scroll at approximately 100px below the viewport top, same-Overview reopening, and no report autofocus on ordinary navigation. Mobile outage/recovery showed the unavailable warning and zero money cards, then restored all three currency cards; Stripe sample totals remained. A 320px check had matching viewport/document width. Console warnings/errors were empty; only the two localhost HTML/JS resources were requested. The temporary tab and server were closed. This is offline shell acceptance, not real authentication, full-schema staging or store certification. Action Centre values update when Overview refreshes; the report has its own refresh control.

The final state-based focus-request implementation was regenerated and rechecked in the actual offline mobile shell: navigation from Customers, repeated Action Centre activation while already on Overview, and normal-navigation focus reset passed with no console errors/warnings. That verification tab/server were closed too.

Remaining beyond this milestone: richer subscription/payment reconciliation workflow, current-price/FX/fees-aware consolidated financial reporting if desired, automation audience compatibility, realistic full-schema staging tests, real sandbox store lifecycle tests and the broader mobile release gates. No production migration, flag, deployment, charge or paid model call was performed.
