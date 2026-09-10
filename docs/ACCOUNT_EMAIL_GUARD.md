# Account deletion — email delivery checkpoint

Updated 9 September 2026. **Local implementation and isolated synthetic SQL tests passed. Disabled, undeployed and not full-schema/staging-certified.** This is one part of shared-account deletion, not a complete deletion processor or a change to production email.

## Purpose and implementation

A queued message can outlive its customer's account. The email consumer previously lacked a final deletion check immediately before SES. The new guard is designed to prevent a permanently fenced account's queued messages from obtaining new send permission.

- Main migration `20260909150518_mobile_account_email_fence.sql` adds a private email fence and an immutable suppression timestamp on the existing outbox. It is the twenty-first unapplied mobile migration.
- Fencing identifies the exact account UUID, the explicit existing account fields in its payload, and unbound messages to the normalized profile email. Pending messages are cancelled; real terminal delivery observations remain accurate.
- The private fence stores a SHA256 email digest rather than another raw address. **This remains pseudonymous personal data, not anonymous data.** Its justified retention and eventual disposal are unfinished.
- Suppression survives later payload redaction. Reassigning an already suppressed message cannot make it deliverable. An explicitly bound different account UUID is not merged or blocked solely because it reuses an email address; ambiguous unbound messages to the old address remain suppressed.
- A narrowly granted, server-only RPC compares the exact recipient/template/payload snapshot and atomically claims one eligible message. Stale snapshots, missing rows, suppressed accounts and ambiguous in-flight claims do not authorize SES.
- The email Worker adds `MOBILE_ACCOUNT_EMAIL_GUARD_ENABLED`, default **false**. With it disabled, the prior delivery path remains. An invalid flag value or unavailable/malformed guard response fails closed without calling SES.
- Guarded requests have a fixed configured HTTPS destination, bounded input/output, a timeout, no redirects and redacted errors. No customer payload or credentials are logged by the adapter.

The migration does not accept a deletion request, ban a real account, send email, or enable a rollout flag. Applying it does install shared-outbox indexes/triggers, so full-schema regression and performance tests are mandatory before deployment.

## Verification on 9 September

| Check | Result |
| --- | --- |
| Email Worker tests | 33 tests across 3 files passed, with database/SES calls mocked |
| Email Worker TypeScript and targeted ESLint | Passed |
| Wrangler local dry-run build | Passed; guard false; no deployment |
| Mobile account source inventory | 123 table declarations and migration hashes covered; source inventory only |
| SQL test runner syntax | Passed |
| New migration, SQL cases and two-connection claim race | **Passed after owner-authorized Docker startup, in the 22-migration isolated suite** |
| Authenticated staging, real queues/SES and full-account deletion | Not run; release-blocking |

SQL cases in `backend/tests/account-email-cases.sql` now passed. The disposable runner loads the original email table definitions and tests exact-account suppression, unrelated accounts, stale snapshots, privileges, address reuse and durable suppression. A separate passing two-connection case attempts the same dispatch claim concurrently. These results certify the synthetic cases, not every full-schema or deployed queue interaction.

## Deliberate limitations and next gates

1. **Already authorized/in-flight email cannot be recalled.** SES can accept a message after its database claim and concurrently with deletion. Complete draining/quiescence and accurate provider observations are needed before any deletion-complete claim. Exactly-once external delivery is not promised.
2. **An uncertain claim is not automatically resent.** A lost successful claim response or crashed consumer can leave a message processing. It requires an audited operational recovery path; blindly resetting it could duplicate a real email.
3. **Automation delivery is not fixed by this work.** Flow runs, outbound webhooks, mixed-customer payloads, nested personal data and every email producer still need their own attribution/suppression review. Only documented exact identity slots are inspected; arbitrary JSON is not assumed safe.
4. **Personal-data erasure remains unfinished.** Outbox/delivery payloads, unsubscribe/suppression data, provider-held data, financial/audit retention, backups and the digest's disposal policy require the full cleanup design. Cancelling a message does not erase it.
5. **No old-fence backfill is included.** If staging has deletion fences created before this migration, explicitly inspect and reconcile them before acceptance testing. No production fences should exist while request acceptance is disabled.
6. **Concurrency and scale require database execution.** Validate trigger/advisory-lock ordering, timeouts/retries, unbound-recipient races, deletion-versus-dispatch and large queues against the complete schema. The newly authored claim race alone is insufficient.
7. Deploy and verify the guarded consumer and migration in isolated staging before enabling any deletion acceptance. Native final deletion remains blocked by its existing code gate as well as disabled flags. Do not enable it just to exercise this incomplete checkpoint.

## Resume safely

The owner authorized Docker and `pnpm test:ledger` passed with all 22 mobile migrations. Temporary Furnio containers were removed. Docker also auto-resumed the pre-existing LiveBy-Rep stack; a separate shutdown question remains unanswered, so do not stop that project's containers by assumption. Continue with the release gates above rather than rerunning unchanged SQL. Never use production or another project's database as a substitute for isolated acceptance.

This milestone does not alter the simulator, website authentication, Stripe configuration, imaging Workers or Admin prompts. No live message, purchase, image job or deletion was performed.
