# Potential subscription overlap follow-up

9 September 2026. **Local implementation only: disabled, unapplied to production and not deployed.**

## What it adds

Admin → Overview → App store reporting → Native billing follow-up includes potential overlapping subscriptions. The signal contributes to the existing Action Centre's global count, not just the first 50 customers. Compact warnings show recorded provider counts; opening the exact customer's billing panel shows full investigation guidance.

One customer produces one overlap signal, even with three subscriptions. Other event/refund/period signals remain separate. The warning is **not proof of duplicate payment**. It never cancels/refunds a plan, grants/removes credits, changes checkout locks, or hides paid transactions.

## Classification

- Requires at least one native subscription in the configured environment, with a nonterminal status and unelapsed recorded period. Active, trialing, grace and billing retry participate. Scheduled cancellation still counts until period end.
- Counts distinct subscription families, not purchases, invoice renewals or duplicate webhook deliveries. Two separate families at the same store can also need review.
- Customer-context Stripe records in active, trialing, past-due, unpaid, incomplete or paused states participate. Developer subscriptions and canceled/incomplete-expired Stripe records do not. This identifies potential obligations, not paid MRR.
- Stripe test/live mode comes from the linked immutable package version. Known opposite-mode records are excluded. Unlinked versions are explicitly **test/live mode unverified**, not assumed to match. Investigate before comparing environments.
- Elapsed native periods remain in period reconciliation, not a claim of a current overlap. Provider delays can still hide a real overlap; store reconciliation remains essential.
- Stripe-only reporting is unchanged. No combined revenue calculation or native MRR estimate was added.

## Security and rollout

Migration `20260909185306_native_subscription_overlap_reporting.sql` replaces only the read-only reporting function. No new table, trigger, index, setting or cleanup obligation. Existing native reporting and Stripe customer indexes support the read; realistic staging query-plan/performance testing remains required.

The function retains active Admin checks, service-role-only execution, empty search path, explicit schema names, server-selected environment and existing database rollout gates. The API retains independent authentication, private/no-store caching, deadlines and redacted failures. Output contains counts/account IDs, not receipts or provider subscription identifiers. These restrictions follow [Supabase function-security guidance](https://supabase.com/docs/guides/database/functions).

The response is version 2. New Admin code rejects an old report instead of falsely claiming overlap checks completed. Apply/test all additive migrations in isolated staging before enabling the updated Admin flags. Older Admin code strips the extra fields. Reporting remains independent of paid-transaction reconciliation. All production flags remain off; tax and advertising settings are unchanged.

## Verification — 9 September, approximately 15:04 Toronto

- **102 Admin tests / 16 files**, TypeScript, targeted lint and final production build pass.
- **923 Mobile tests / 54 files**, TypeScript and frozen contracts pass. Native runtime source was unchanged; no redundant simulator rebuild or repeat of owner-accepted brushing.
- With explicit owner permission, started Docker and ran the isolated PostgreSQL suite. The first run caught a reserved-word CTE name; it was corrected. The second run passes all **22 mobile migrations**, overlap cases and existing ledger, environment, ownership, refund, acquisition, cancellation, deletion-fence and concurrency tests. The previously pending account-email migration/dispatch race also passes this isolated fixture. This is not full Supabase production-schema or store certification.
- Overlap SQL assertions cover duplicate/renewal deduplication, same-/cross-store families, Stripe/native states, scheduled cancellation, developer exclusion, environment separation, unknown Stripe mode, stale periods, redaction, unchanged credits/subscriptions and restricted privileges.
- Source deletion inventory remains 123 tables; unchanged retention classifications reviewed, this migration's final hash added. No inventory exception suppressed.
- Offline real-component Chrome QA used a **file URL**, no preview server, synthetic in-memory API responses and CSP `connect-src 'none'`. Updated warning screenshots inspected at 1280px and 390px. A 320px check has no horizontal overflow and minimum 44px customer buttons. Opening customer 401 retained the warning, requested only that fixture customer's native billing/support, and focused the selected panel. Closing restored button focus; Next showed only customer 451 and no inherited overlap warning. Console errors/warnings empty. The temporary tab is closed.
- Both temporary test containers were removed by the harness; no Furnio test container remains. Docker itself automatically resumed the owner's pre-existing **LiveBy-Rep** Supabase stack and its previously configured published ports. Owner was informed and asked whether to quit Docker after testing. **Await the actual reply; do not stop that other project by assumption.** No existing container configuration or data was changed.

## Still required

Full isolated staging schema/performance and actual sandbox store lifecycle verification; larger account-deletion completion; nine-service staging parity; purchase certification; Android prerequisites, physical devices and store approval. This reporting milestone does not complete those gates. All 22 mobile migrations remain unapplied to production. No deployment, charge, model generation or Git push; Mobile still has no remote.
