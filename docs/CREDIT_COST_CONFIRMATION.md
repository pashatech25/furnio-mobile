# Mobile credit-cost confirmation

Implemented locally on 9 September 2026. **Disabled, not deployed, not staging-certified.** No paid model calls or production data changes were made.

## Customer behaviour

The app captures the credit total shown in the confirmation modal. A valid trial preview confirms zero credits; a paid job confirms the current service price, multiplied by the number of views where appropriate. The server independently resolves price and eligibility. A changed cost or a paid/trial mismatch returns `409 CREDIT_QUOTE_CHANGED` before job records, processing derivatives, credit reservations or provider submission.

The app refreshes public service settings, balance and trial state and asks the customer to review again. It never automatically submits at a replacement price. Previously uploaded sources may remain and follow the existing upload/retention rules; this does not promise resumable uploads or refund storage quotas.

## Versioned contract

On the existing customer API Worker, behind `MOBILE_CREDIT_QUOTES_ENABLED=false`:

- `POST /api/mobile/v1/jobs/stage`
- `POST /api/mobile/v1/jobs/enhance` (twilight, winter-to-summer, exterior enhancement)
- `POST /api/mobile/v1/jobs/multiview`
- `POST /api/mobile/v1/jobs/mask-edit` (item removal, custom staging)
- `POST /api/mobile/v1/jobs/floorplan`
- `POST /api/mobile/v1/jobs/reference-furniture`
- `POST /api/mobile/v1/batches/reserve`

Each requires the same verified **customer** bearer identity and the header `X-Furnio-Expected-Credits`: canonical nonnegative integer, at most eight digits. Missing/invalid headers return 400; disabled routes return 404; internal developer credentials are rejected on these aliases. Body schemas are unchanged. The submitted number is only a comparison, never a pricing input or credit grant.

These aliases mount the existing job handlers. Admin feature resolution, prompts/snapshots, source ownership, phone/trial rules, atomic credit reserve/claim/refund and provider queues remain authoritative. Original website/developer routes remain compatible; the mobile client explicitly refuses unquoted legacy job submissions. It does not fall back when an older backend returns 404. Job-status reads retain their original endpoints.

## Batch price preservation

The whole batch total is checked before the existing atomic reservation RPC. The returned reservation is checked again before allocating signed uploads. An idempotency replay with a different already-reserved price returns **`409 BATCH_QUOTE_CONFLICT`** and retains the recovery journal. It must not be treated as a new uncharged batch or automatically resubmitted.

For each uploaded batch item, the Worker reads only its exact owned item/asset and related reservation. It requires an unclaimed uploaded item, a matching supported service, the same customer, an active unexpired batch, and a valid stored unit price. Reads are bounded, timeout-protected, redirect-disabled and response-validated. The existing atomic claim still decides whether the item can start.

Job accounting and submission-failure refunds use the stored `processing_batches.credits_per_output`, not a newer Admin price. The client sends the reservation's original per-photo amount. No second debit is introduced. A failed lookup, claimed/expired item or unmatched price prevents submission. No schema migration was required for this change.

## Local verification

- 39 new customer API route tests: all nine service selections, matching/mismatching costs, header validation, disabled gate, developer-credential exclusion, paid/trial changes, unchanged web paths, exact-owner batch reads, invalid reservations, bounded reads, reserved-price accounting/refunds and idempotent-price conflicts.
- Mobile transport and batch tests cover required confirmation, zero-credit trial headers, all six versioned job endpoints, no older-backend fallback, unchanged unrelated requests, full-batch/per-item quotes and recovery on inconsistent allocations.
- Full current suites: **468 mobile tests / 31 files**, **189 customer API tests / 22 files**, **49 web tests / 13 files**.
- Mobile and dedicated mobile Worker TypeScript pass. Targeted customer API lint passes. Main API compiler comparison retains only the same four unrelated reference-furniture diagnostics; a whole-main clean typecheck is not claimed.
- Customer API Worker dry-run succeeds with the new flag false; no deployment. Existing processing consumer Workers were not redeployed.

## Release gates

Deploy/configure only in an isolated staging environment first. Confirm pricing changes during upload, trial-to-paid transitions after Admin grants, all supported batch services, simultaneous spending, claim/expiry races, actual Supabase relationship responses and price-preserving refunds. Verify equivalent Admin prompt snapshots without paid provider calls first. Any paid generation still requires approval.

Enable the customer API quote gate before distributing a staging app that uses it. Production remains off until acceptance; disabling it prevents new mobile submissions without altering existing processing, financial reconciliation, website access or the original job-status routes. This safeguard does not complete store billing, account deletion, notifications or physical-device acceptance.

Primary references used for this implementation: [Supabase relationship queries](https://supabase.com/docs/guides/database/joins-and-nesting), [Cloudflare Worker practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/). Source behaviour and local tests, not these references, establish the Furnio-specific accounting rules above.
