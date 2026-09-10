# Hosted staging integration — 9 September 2026

## Current result

**Website-only follow-up:** the customer staging API is now version `a04e1d98-7e05-4a38-9e19-6258bf50e892`, adding only GET `/api/billing` to its reviewed allowlist. Ten grouped hosted checks pass, including unsigned/invalid/phone-pending rejection, server-selected customer identity, no native billing dependency, and blocked checkout/subscription actions. Mobile now reads this existing website API. The earlier customer version and nine-check counts below are historical. Purchases remain disabled; production is unchanged. See `STORE_SUBMISSION_STATUS.md` for the actual store-account state; RevenueCat setup is no longer a release task.

The first authenticated hosted milestone passes. This is not acceptance of generation, payments, OAuth/SMS, push, deletion or store submission. Production website/database/Workers are unchanged.

- Supabase: `bcrobmrimzkvfrnqarmv` (Furnio-Mobile-Staging, existing Furnio Pro org, us-east-1 Micro).
- Installed 59 reviewed Main/Admin migrations. The 60-source inventory excludes only the data-only legacy Stripe-live cleanup `20260831092206_prepare_stripe_live_mode.sql`. No real records copied. The duplicate Main/Admin timestamp is ordered explicitly; applied filenames/hashes are recorded in `private.staging_schema_migrations`, not normal CLI history.
- 107 public tables; all have RLS. The 19 full-schema behavior checks pass against actual hosted Postgres in a rolled-back transaction.
- TLS uses the official pinned Supabase CA and session pooler with `verify-full`; no DNS, proxy or TLS-security changes.
- Three synthetic Auth accounts. Only the two browsing fixtures have per-account phone exemptions; the third remains blocked by phone verification. Each browsing account has 20 test-only administrator credits. No SMS/emails, real users or store transactions created.
- Database native environment is SANDBOX, with all purchase/deletion switches off.

## Deployed resources

| Resource | Exact target |
| --- | --- |
| Customer API | `furnio-api-mobile-staging.amidi-alipasha.workers.dev` |
| Mobile support API | `furnio-mobile-staging.amidi-alipasha.workers.dev` |
| Separate JWKS KV | `b395fa3c822f41269c1c5f8cd472449c` |
| Cloudflare account | `414fde01446debc02bbdd49e29e3a875` |

Customer API version: `c16f63b1-f391-462d-96ff-69573588ae8b`. Mobile API version after runtime fixes: `b08527ee-08e6-4807-a39c-dab3a98fcc0f`. The customer entry point permits only health/config/location, authenticated account/trial/balance/project reads and empty project creation. Other mutations are blocked before the shared router. Mobile billing/activity reads are enabled only in staging. No R2, queue, cron, imaging binding or provider secret is attached to this initial milestone.

## Evidence and runtime fixes

`node scripts/verify-staging-api.mjs --staging-only` passes nine grouped checks: three actual password sign-ins; both Worker health; public configuration (currently seven enabled seed services); authenticated service binding; pending-phone denial; project create/list/detail plus cross-account API/RLS denial; both storefront billing readers/activity; blocked paid/outbound actions and browser origins; unchanged balances/no jobs/store transactions. Redacted evidence is in `output/staging-api-acceptance.json`.

Two real Cloudflare runtime failures were missed by Node mocks and fixed:

1. `redirect: "error"` is rejected by workerd before I/O. Native adapters now use `manual` and reject non-2xx responses without following them. New mobile API/Automation/Email compatibility code is corrected locally; production Workers are not redeployed.
2. Storing native `fetch` on an adapter and calling `this.fetcher(...)` gives it an invalid receiver. Database and RevenueCat adapters now call it with `globalThis`. Receiver/redirect regression tests were added; no credentials or provider payloads were logged.

References: [Cloudflare invocation errors](https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors), [workerd receiver behavior](https://github.com/cloudflare/workerd/issues/6904), [workerd HTTP implementation](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B).

Latest local checks: 1,054 Mobile tests / 58 files; Mobile and Worker TypeScript; 179 targeted Main tests / seven files. Main's four pre-existing reference-furniture TypeScript diagnostics remain, so the whole Main typecheck is not declared passing.

## Safe continuation

- Secrets are ignored/mode0600 in `.env.staging.local` and `.env.staging-api.local`; never print, commit or load those files into Expo. Synthetic credentials are in ignored `output/staging-customers.json`.
- `prepare-staging-native.mjs --staging-only` writes a PUBLIC-only configuration. Local build helpers accept `--staging`, pin exact endpoints, remove ambient provider secrets, disable dotenv auto-loading and keep purchases off. Native UI labels staging. Real native acceptance is recorded after each actual build, not inferred from API checks.
- Deployment helper accepts only the exact two staging Worker names/configurations. Main's production CLI link remains untouched. Do not provision a second staging project or replay applied migrations.
- RevenueCat login page is open for owner sign-in. Store products/signing/OAuth/SMS, isolated imaging infrastructure/all nine services, full deletion plus approved retention, push and physical-device/private-store acceptance remain. Open Google Play for the owner to select the correct account before Play configuration/submission. No Mobile Git remote is configured.
