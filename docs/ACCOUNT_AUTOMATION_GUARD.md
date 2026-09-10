# Account deletion — automation suppression checkpoint

9 September 2026. **Implemented and tested locally; disabled and undeployed. Full account deletion remains blocked.** This checkpoint neither executes a real flow nor changes live customer access, purchases, image processing or website authentication.

## What changed

- Main migration `20260909193514_mobile_account_automation_fence.sql` is the **23rd unapplied mobile migration**. It adds permanent `deletion_suppressed_at` markers to automation events, runs, waits and webhook delivery rows. It creates no new table, account or deletion request.
- The existing private account fence cancels matching queued/running/waiting work and pending deliveries. Markers survive context redaction, stale PATCHes, changed associations and retry attempts. A wait cannot restart a suppressed run. Real historical completion or a late, already-admitted HTTP acceptance remains recordable.
- Attribution covers explicit customer/user subject UUIDs; nested `customer_id`, `user_id`, `customer.id`, customer collections and customer/user subjects; and a run's event association. Malformed identity fields do not cause UUID casts to fail. Arbitrary text, email-only payloads and unrelated `id` fields are not assumed to identify an account.
- A server-only RPC compares the freshly loaded run/event snapshot before permitting work. Context, selected node, flow/version and test/live mode changes invalidate the run snapshot. It uses the same account advisory locks as cleanup and reloads after a lock wait.
- The Automation Worker checks before node execution, event/customer fan-out, email/profile writes and immediately before an external webhook call, after asynchronous preparation. New customer searches exclude fenced accounts while keeping the original result order.
- A stale or unavailable safety response retries the queue message; it does **not** select the flow's failure connector, which could send another message. Missing/suppressed work stops. Guard transport uses only the configured HTTPS database origin, rejects redirects, caps request/response size, enforces a five-second deadline and returns redacted errors.
- `MOBILE_ACCOUNT_AUTOMATION_GUARD_ENABLED` defaults to **false** in the Worker and local example. No new secret is required for this checkpoint. With the flag absent/false, existing work does not depend on the new RPCs. An invalid non-false value fails closed. Generated Worker types were refreshed.
- Independent of that flag, ordinary run queue messages no longer skip a waiting node, and resume messages only advance the matching currently waiting node. They cannot resurrect a terminal run. This correction still requires real queue/staging regression before deployment.

## Verification

- **39 Automation Worker tests / four files**, TypeScript and ESLint passed. Tests cover disabled behaviour, malformed/stale/blocked responses, timeouts, bound sizes, trusted destination, customer filtering, terminal waits, final webhook recheck, failure-route suppression and queue retry.
- Wrangler dry-run build passed: **592.52 KiB / 90.30 KiB gzip**. Types check passed. This did not deploy a Worker.
- **All 23 migration files passed the isolated PostgreSQL suite**, including existing credit, Stripe/native compatibility, refund, account, email and reporting cases. The harness loads original automation table definitions and exercises worker-role writes with browser access revoked/RLS enabled.
- New SQL cases cover unrelated customers, mixed-customer contexts, event-only association, durable suppression after redaction/rebinding, sent-history accuracy, late inserts, snapshot matching and function privileges.
- Separate connections tested both writer-before-fence and fence-before-writer ordering. A safety check that had loaded an old run and waited for the fence returned `blocked` after reloading. No temporary Furnio test container remains.
- Mobile/backend **968 tests / 55 files**, Mobile/Worker TypeScript and frozen API contract checks passed. No native code changed or simulator rebuild was needed for this checkpoint.
- Inventory remains **123 declared tables**. Only the new migration's reviewed hash is added to the baseline; no previous migration hash is rewritten.

The first SQL fixture runs failed because the synthetic event/destination omitted required `occurred_at`/`purpose` columns. The original definitions were inspected and the fixtures corrected; no production schema was weakened. Test-only TypeScript/lint errors were corrected before the final passing runs. Installed Supabase CLI 2.40.7 has no database-advisors command; role/privilege assertions are not a substitute for full-schema security advisors before staging release.

## What this does not guarantee

1. **No recall or exactly-once promise.** An HTTP/email action admitted before the fence can finish afterward. The fresh RPC is not an atomic external-dispatch lease. Complete in-flight accounting, quiescence and ambiguous-delivery recovery before marking deletion complete. An existing webhook timeout/retry can still be ambiguous.
2. **No complete personal-data erasure.** Payloads, node summaries, errors, audience observations, marketing queues, email-only or arbitrary free-text references, AI invocation inputs and provider-held copies still require attribution/retention/erasure work. Suppression is not erasure.
3. **Mixed saved contexts are stopped as a unit.** A run still carrying the deleting customer's data is not silently rewritten. Future fresh searches omit that account. Test collection variants, parent/child races and customer-free global flows against the full schema.
4. **No old-fence backfill.** Before enabling the guarded consumer in staging, check whether fences predate this migration and explicitly reconcile them. There should be no production fences while final request acceptance remains blocked.
5. **Scale and lock retries remain staging gates.** The new indexes help account lookup, but large queues, event-linked queries, nested JSON depth and bulk cleanup need benchmarks. Multi-account updates can contend or deadlock with concurrent cleanup; abort/retry must stay fail-closed. The tested two-connection orderings do not cover every bulk/deadlock case.
6. **Do not disable the guard after accepting deletion.** Keep safety enforcement running for existing fences during rollback. Disable new deletion acceptance/mobile entry instead. Do not reverse the migration or delete suppression markers/purchase records as routine rollback.

## Rollout order — not performed

1. Finish the remaining identity/session/provider revocation, personal-data/retention and completion stages; keep `deletionProcessorImplemented = false` until all release gates pass.
2. Apply additive migrations only to the intended isolated full-schema staging project. Run security advisors, real Auth/queue tests, denied-role tests and volume/lock tests there.
3. Deploy and enable the guarded automation and email consumers against staging; verify ordinary customers, all flow connectors, waits, retries, fan-out and in-flight deletion scenarios. Do not use live customer flows as tests.
4. Obtain owner acceptance before any shared production rollout. Preserve the website, Stripe logic, account IDs and normal developer permissions.

Docker was owner-authorized for the isolated database tests. Its pre-existing LiveBy-Rep stack is unrelated and remains untouched; the separate question about quitting Docker has not been answered. No ports, DNS, proxy, firewall or Wi-Fi settings were changed for these tests.

Supabase security/privilege guidance informed the private implementation/server-only RPC boundary; Cloudflare Workers and Wrangler guidance informed bounded I/O, generated types and disabled rollout validation. Reference documentation: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/), [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/).
