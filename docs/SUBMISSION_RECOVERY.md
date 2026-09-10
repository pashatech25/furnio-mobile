# Ordinary Studio submission recovery

Implemented locally on 9 September 2026. **Disabled/unreleased; not a production recovery guarantee.** Directional brushing remains owner-accepted and was not retested.

## Behaviour

- Before the final Studio job POST, save and read back a device-only encrypted receipt: version, random ID, environment hash, customer/project IDs, service, timestamp and uploaded source/reference/anchor IDs. No photos, filenames, signed URLs, directions, master prompts, contact information or tokens.
- One unresolved receipt per account/environment on this device prevents another ordinary Studio submission. Namespaces include app mode, API/Auth environment hash and exact customer UUID. Concurrent claims serialize; deletion compares the full record. Corrupt/foreign/unreadable records fail closed, not empty. The single native item is under 1,800 UTF-8 bytes. Browser previews are not a persistent-storage fallback.
- The HTTP transport marks dispatch only after authentication and serialization, directly before fetch. Before-dispatch cancellation or explicit before-work credit-quote rejection can release an attempt. Unknown responses, generic service rejections and post-dispatch account changes retain the receipt. **No automatic paid POST retry.**
- Success retains the receipt through navigation. Only after an owned job has rendered and a separate exact lookup confirms its ID is the receipt acknowledged. Device cleanup failure cannot turn an accepted job into a resubmission.
- Studio reopens with a status-check card and the original project-history shortcut. A unique match opens the job, including queued/running/failed states; checking does not retry, cancel, refund or declare the image successful.

## Read-only API

`POST /api/mobile/v1/submissions/recover`

Input: `{ projectId, service, sourceIds, referenceIds, anchorId }`.
Output: `{ state: "found", jobId, status }`, `{ state: "not_found" }` or `{ state: "needs_review" }`.

New independent flag: `MOBILE_SUBMISSION_RECOVERY_ENABLED`, **false** in Main's API configuration. Existing verified customer/platform permissions apply; internal developer credentials are rejected. Private/no-store responses, strict UUID/service/cardinality validation, 2 KB request/8 KB response bounds, read deadlines and redacted failures.

The only database request is a GET of at most two jobs filtered by exact owner, project, service type and first uploaded source ID. The narrow projection excludes prompts and image URLs. Full ordered sources, anchor, references, service and mask mode are rechecked. Duplicate/inconsistent rows are not resolved by choosing the newest.

No new migration, ledger mutation, prompt change, imaging Worker change or website processing change. Main's unrelated dirty work is preserved. Wrangler generated binding types; the dry-run did not deploy.

## Limits and release gates

1. **Not found does not mean not accepted.** The original handler may still be running or retention/visibility may require support. Never clear based only on elapsed time or an empty lookup; no blind retry button.
2. This is device recovery, not cross-device server idempotency. Deliberate new uploads elsewhere and loss of device storage are not prevented by this receipt. Uninstallation cannot prove that a job was never accepted.
3. An unresolved/corrupt receipt may require support. Safe audited resolution, retained/archived-project cases and confirmed-deletion closeout remain release gates. Do not delete receipts as a workaround.
4. The app checks the recovery route using the newly uploaded IDs before dispatch. Unavailable recovery prevents the job POST; earlier uploads may already have completed. Resumable/unused-upload handling remains separate.
5. Test native Keychain/Keystore restarts, locked/low-storage devices, real account changes, delayed responses, exact PostgREST projection against the full staging schema, query performance and physical-device UX. Current tests use injected storage/HTTP, not a live database.
6. Enable only in isolated staging after review, alongside the required mobile expected-credit route. All production flags remain off. The earlier **21 migrations are still unapplied**; this slice adds none. Docker remains owner-stopped.
7. Receipts survive sign-out for same-account recovery and are removed after confirmed job viewing. Unresolved receipts do not silently expire. Include this namespace in separately gated confirmed-account-deletion/device closeout, not ordinary draft cleanup.

## Evidence

- Mobile: **923 tests / 54 files**, TypeScript, frozen contracts and diff check passed. Receipt tests cover persistence, corruption, scope isolation, serialized claims, pre-dispatch faults, uncertain responses, navigation-window retention and exact viewed-job acknowledgment. Existing preflight assertion now specifically verifies photo selection cannot clear uncertainty.
- Customer API: **271 tests / 24 files**, targeted lint and dry-run bundle passed. Covers all nine services, disabled/unauthenticated/internal access, owner/project/source checks, multiview order/anchor, duplicate/empty results, stalled bodies and redacted failures.
- Full API TypeScript still has four previously recorded errors in untouched reference-furniture files; not claimed clean. Source inventory remains 123 tables with unchanged migration hashes.
- Final beta Release/configuration build `output/ios-simulator-2026-09-09T18-41-41.796Z.log` passed and is installed. JS SHA256 `edbb43fc2d441c888e5d5e7063f64dbfac82643aeecbef7c63f82e90ede6d4a7` matches the installed bundle. Native sample login → Home → project → result → Back → Home passed; PID 61325 alive at 14:47 and no newer Furnio crash report in the bounded check. An intermediate build also passed Studio layout inspection. Build warnings remain. These checks do **not** certify live recovery, native receipt persistence, purchases or physical-device behaviour.
- No paid image request, real login/purchase, live database mutation, deploy, network setting change, Docker restart or new listener.

## Guidance

Cloudflare, Workers best-practices, Supabase and Wrangler skills guided bounded private reads, ownership checks, generated types and disabled rollout. Primary references: [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Wrangler types](https://developers.cloudflare.com/workers/wrangler/commands/#types), [PostgREST JSON projections](https://docs.postgrest.org/en/stable/references/api/tables_views.html#json-columns), [Expo SecureStore limits/persistence](https://docs.expo.dev/versions/latest/sdk/securestore/).
