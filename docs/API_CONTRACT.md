# Native customer API contract — foundation snapshot

Initially recorded 2026-09-08; updated 2026-09-09 against the Furnio working tree, including the additive result-source contract. This is an integration inventory, not a claim that staging or store billing is operational.

## Ownership and source

### Ordinary Studio recovery (additive, disabled)

`POST /api/mobile/v1/submissions/recover` accepts `{ projectId, service, sourceIds, referenceIds, anchorId }` under the existing verified customer session. It returns an exact owned-job match, `not_found` (still uncertain), or `needs_review`. Independent API flag: `MOBILE_SUBMISSION_RECOVERY_ENABLED=false`. The app checks this route before the first job POST; no fallback to legacy processing. See `SUBMISSION_RECOVERY.md` for device receipts, bounded projections, retained uncertainty and staging/support-resolution gates. This does not change frozen service request schemas or processing Workers.

The existing customer API remains authoritative for identity permissions, service availability, Admin prompts, uploaded assets, jobs and credit reservations. The native app does not call FAL, hold provider keys, send a master prompt or access Postgres directly.

`src/contracts/{auth,jobs,uploads}.ts` are byte-preserving imports from `packages/shared/src` in `furnio-main`. `src/contracts/manifest.json` records their checksums. `pnpm check:contracts` checks this snapshot, **not parity with deployed production**. The uploads snapshot includes pre-existing uncommitted reference-furniture work; review its deployment status before staging integration. Do not hand-edit the imported contracts.

`src/api/schemas.ts` validates the selected current customer response fields. Additional unknown response fields are ignored, not passed through as trusted permissions. A future changed/incompatible response fails visibly.

## Existing routes used by the client

| Operation                    | Route / mechanism                                                                            | Safety requirement                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Sign in / signup / recovery  | Existing Supabase client APIs                                                                | PKCE, native secure storage, additional callbacks only                                                               |
| Google                       | Supabase OAuth in system authentication browser                                              | Validate return scheme/host/path and exchange a one-time code                                                        |
| Apple                        | Native Apple credential → Supabase ID-token verification                                     | Hashed nonce; no custom matching/merging of users                                                                    |
| Verify customer access       | `GET /api/me`                                                                                | Existing suspended/developer-only restrictions apply                                                                 |
| Public service configuration | `GET /api/public-config`                                                                     | No auth header; server prices and enabled services                                                                   |
| Trial state                  | `GET /api/trial`                                                                             | Preserve existing trial rules                                                                                        |
| Reconcile verified phone     | `POST /api/trial/phone/reconcile`                                                            | Existing server reservation; never sends another SMS                                                                 |
| Coarse country hint          | `GET /api/location-country`                                                                  | Only country preselection; manual choice wins                                                                        |
| Send SMS                     | `POST /api/trial/phone/start`                                                                | Country, phone, Turnstile token; current server throttles                                                            |
| Confirm SMS                  | Supabase `verifyOtp` with `phone_change`, then `POST /api/trial/phone/complete`              | Do not bypass verification or resend limits                                                                          |
| Project list / create        | `GET` / `POST /api/projects`                                                                 | Customer bearer, validated structured property fields                                                                |
| Project workspace            | `GET /api/projects/:id`                                                                      | Server checks ownership; includes history and photo usage                                                            |
| Archive                      | `POST /api/projects/:id/archive`                                                             | Existing destructive media-removal semantics, explicit modal                                                         |
| Balance                      | `GET /api/credits/balance`                                                                   | Server balance, not a client-maintained live number                                                                  |
| Photo upload                 | `POST /api/uploads/presign` → signed PUT → `POST /api/uploads/:id/complete`                  | JPEG / supported floor-plan PDF, current size limits; no bearer on storage PUT                                       |
| Region masks                 | `POST /api/uploads/mask/presign` → signed PUT                                                | Binary/composite PNG masks, bounded sizes                                                                            |
| Batch processing             | `POST /api/mobile/v1/batches/reserve` → signed uploads → quoted mobile job aliases with `batchItemId` | Reserve once before upload; per-photo settings and masks; no automatic paid retries; encrypted local intent recovery |
| Job status                   | `GET /api/jobs/:id?includeSources=1`                                                        | Foreground polling, real statuses, partial results; optional original per result behind a disabled API flag |
| Trial result unlock          | `POST /api/trial/assets/:id/unlock`                                                          | Server checks ownership, price and spendable credit                                                                  |
| Download                     | `GET /api/assets/:id/download`                                                               | Recheck access; use returned `downloadUrl`, never derive a clean trial URL                                           |

The mobile-only support Worker is not a replacement proxy for these imaging routes.

## Nine service requests

**Native submission now uses versioned aliases**: replace `/api/jobs/` in the existing-handler table below with `/api/mobile/v1/jobs/`. Each POST requires `X-Furnio-Expected-Credits` and the independent customer API flag `MOBILE_CREDIT_QUOTES_ENABLED=true` in approved staging. The app never falls back to the legacy path. Existing body schemas and prompt selection remain unchanged; ordinary status reads still use `/api/jobs/:id`. See `CREDIT_COST_CONFIRMATION.md` for trial handling, batch snapshots and errors.

| Service              | Existing endpoint               | Native controls / request fields                                                   |
| -------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Virtual staging      | `/api/jobs/stage`               | Source, room type, style, mood, additional direction                               |
| Matched multi-view   | `/api/jobs/multiview`           | 2–4 views of one room, selected anchor, view ordering, room/style/mood/direction   |
| Item removal         | `/api/jobs/mask-edit`           | Remove mode, up to eight painted regions, region masks and instructions            |
| Custom staging       | `/api/jobs/mask-edit`           | Custom mode, per-region replace/restyle/remove and instructions                    |
| Twilight             | `/api/jobs/enhance`             | Pink twilight, blue hour or natural dusk                                           |
| Winter to summer     | `/api/jobs/enhance`             | Source and service; existing server default preset                                 |
| Exterior enhancement | `/api/jobs/enhance`             | Clean driveway, green grass, blue sky, remove leaves                               |
| Floor plan           | `/api/jobs/floorplan`           | JPEG or single-page PDF; server validates PDF contents                             |
| Reference furniture  | `/api/jobs/reference-furniture` | Room, 1–5 references, one normalized placement pin per piece, additional direction |

`parseServiceRequest` validates/strips each request with the frozen schemas. Tests cover all nine and reject mode mismatches or invalid view/pin inputs. This is request-shape evidence; matching the **deployed prompt snapshots** still needs staging tests.

## Mobile Worker v1

Implemented foundation: `GET /health`, `GET /v1/capabilities`; gated `GET /v1/session` delegates customer authorization through a service binding; gated `GET /v1/challenge` serves a nonce-bound Turnstile page on the specifically configured HTTPS host. The challenge WebView is only this security check, not the application UI.

All capability readiness values are currently false. `MOBILE_ENABLED=false` by default. No production routes, production bindings, database credentials, provisioned queue or purchase secret are configured.

Implemented but disabled/unconfigured: `POST /v1/webhooks/revenuecat` performs authenticated, independently verified, queued purchase reconciliation; `GET /v1/billing?store=APP_STORE|PLAY_STORE` reads the shared balance/current providers/store-specific catalog; `GET /v1/activity` uses an optional `beforeAt` plus `beforeId` cursor. Billing and activity reads each have separate disabled flags. Their migrations are local and unapplied. See `NATIVE_BACKEND.md` for the remaining financial release gates.

Implemented locally, disabled/unconfigured: authenticated `POST /v1/devices/prepare`, registration `POST /v1/devices`, owned `POST /v1/devices/status`, and installation-capability-only `POST /v1/devices/disable`. Independent cron/outbox delivery and receipt checks are implemented without changing imaging Workers. See `NOTIFICATIONS.md` for strict bodies, monotonic revisions, offline cleanup, privacy and physical-device/configuration gates.

Reserved but **not implemented**, deliberately unavailable:

- `POST /v1/account/delete`

Implemented locally, disabled/unconfigured: `GET /v1/account/deletion/review` accepts no parameters and returns a read-only, recently authenticated shared-account inventory. It verifies the bearer token with Supabase Auth plus the exact live session/AMR/assurance in the database. It remains independent of paid/platform/phone/suspension restrictions, and it cannot request or execute deletion. `canRequestDeletion` and `accountDeletionReady` remain false. Disabled request APIs add POST `/v1/account/deletion/prepare`, `/cancel` and capability-only `/status`. POST `/confirm` is code-blocked until the cleanup processor exists; it accepts no destructive request in this build. Input is strict, bounded JSON. Status recovery is independent of app-entry flags and login. See `ACCOUNT_DELETION.md` for the contract, source inventory and remaining destructive-workflow gates.

Privacy review/request readiness now also requires independent rate-limit bindings and the server-only `ACCOUNT_DELETION_LIMIT_SECRET`. Source/account/complete-receipt counters run before database work; denial returns 429 with `Retry-After: 60` and no-store. Misconfiguration/failure returns a redacted 503. Status retains this protection after sign-out/entry rollback; neither error permits automatic deletion retries. See `ACCOUNT_PRIVACY_RATE_LIMITS.md` for exact limits, direct-ingress requirements and real-edge acceptance still pending.

Implemented locally, disabled/unconfigured: `POST /v1/purchases/reconcile` accepts only `{}` and starts/reuses account-scoped durable RevenueCat history recovery; `GET /v1/purchases/reconcile` reads that customer's status. Possible statuses: `pending`, `needs_review`, `no_purchases_found`, `not_started`, `synchronized`, with nullable `checkedAt`. Internal queue/run/lease/cursor identifiers never reach the client. See `NATIVE_RECOVERY.md` for fail-closed history handling and pending acceptance gates.

Implemented locally, disabled/unconfigured: `POST /v1/purchases/eligibility` reserves a provider/product/request-ID selection; `POST /v1/purchases/intents/:id` launches once, reports a transaction lookup hint, or cancels only before launch; `GET` reads the account-scoped intent status. Exact purchase confirmation requires server-verified ledger delivery. See `NATIVE_PURCHASE_INTENTS.md` for bounded schemas, interruption rules and remaining operational blockers.

`POST /v1/purchases/recover-selection` now handles a lost eligibility response using only `{store, requestId}`. It cancels an existing unlaunched reservation or returns the existing protected checkout state; account/environment come from the server. Native Admin support can link an existing verified payment with current role checks, an audit reason and explicit confirmation. See `NATIVE_CHECKOUT_SUPPORT.md`; neither path can create credits or release an uncertain launched payment.

Do not register store callbacks until isolated staging is configured and tested. Completing native commerce requires actual restore/backfill acceptance, purchase-intent/cross-provider lock certification, operational cancellation/unknown-payment recovery and full compatibility acceptance, not merely changing readiness booleans.

## Additive shared billing contract (disabled)

- Existing customer `GET /api/billing` retains its Stripe fields and may add `nativeBilling` only for a native customer when server/database compatibility flags are enabled. Native transaction IDs never become Stripe invoice IDs.
- Existing monthly Stripe checkout performs a known-native-subscription check and, under the new disabled protection gate, reserves the same account-level acquisition lock as native checkout. Independent two-connection SQL race tests pass locally; external storefronts and older unprotected sessions still require operational cutover/reconciliation. One-time top-ups are unchanged.
- Admin `GET /api/admin/customers` uses a native-aware filtered RPC only under its disabled native flag. Native plans are separate optional properties, not replacements for the existing Stripe `subscription` object.
- Admin `GET /api/admin/customers/:id/native-billing` is an authenticated owner/admin/finance/support read. It exposes bounded provider-labelled subscriptions/payments/reconciliation references, not receipts, store tokens or raw webhook payloads. Disabled returns no block and performs no billing read.
- These APIs and the associated migrations are local, unapplied/unreleased. Global Admin metrics/automation segmentation, operational recovery actions and actual-store acceptance remain pending.

## Integration gaps that must be closed

1. **Batch processing:** the native editor and orchestrator now use the existing reservation API, per-photo settings/masks, one atomic reservation, stop-on-failure and accepted-job references. Local encrypted intent recovery prevents automatic resubmission after a crash. Full native/background interruption testing and resumable uploads remain; matched views/reference furniture are not generic batches.
2. **Activity pagination:** a bounded, owned-job keyset API and load-more UI now replace the ten-project cutoff. Migration/flag activation, complete-schema staging and large-account performance tests remain.
3. **Result/source pairing:** implemented locally through optional `results[].source` metadata from stored source/step identities. The app never uses ambiguous project-history originals and shows results alone when metadata is missing. The independent API flag remains disabled; staging/physical-device acceptance is pending. See `RESULT_COMPARISONS.md`.
4. **Cost confirmation:** required versioned aliases and expected-credit headers enforce server-derived paid/trial costs before work. Batch jobs retain their reserved unit price. The independent flag remains disabled; staging acceptance is pending. See `CREDIT_COST_CONFIRMATION.md`. Client prices never determine ledger debits.
5. **Draft/upload recovery:** native encrypted draft metadata restores for 48 hours while app-private cached files remain. Batch intent/job-reference recovery and stop-remaining controls are implemented. Stopping does not cancel an already accepted job; unclaimed reservations use server expiry/refunds. Background resumable uploads remain pending; never automatically retry an uncertain job POST.
6. **Identity switching:** secure storage, PKCE and stale-state guards are implemented. Real OAuth/recovery/Apple relay-email linking, signout, reinstall and cross-account ownership must be exercised against staging. Never manually merge accounts by similar names/emails.
7. **Native deletion and notifications:** push registration/disable, independent delivery, receipt checks and offline cleanup are implemented locally behind disabled flags; real-device/staging/privacy/monitoring acceptance remains. Account deletion now includes native UI, isolated same-account reauthentication, a device-only recovery journal, tested recent-auth/session/AMR review and disabled confirmation API. `accountDeletionReviewReady` / `accountDeletionRequestsReady` are additive read-only readiness fields and default false in older responses; `accountDeletionReady` remains false. Provider revocation, session invalidation, full media/personal-data cleanup and approved financial retention still need implementation. The native confirm action cannot bypass the disabled server/code gate.
8. **Native editor fidelity:** verify mask/placement transforms and full-resolution output on physical devices, including large images, installed fonts, orientation and keyboard/screen-reader behaviour.

## Current platform references

- [RevenueCat React Native integration](https://www.revenuecat.com/docs/getting-started/installation/reactnative): separate platform SDK keys and Android `singleTop`/`standard` launch mode. The local Expo config plugin sets `singleTop`; banking-app and authentication returns still require Android QA.
- [Expo config plugins](https://docs.expo.dev/config-plugins/plugins/): native configuration is generated through an additive config plugin, not hand-patched generated projects.

Re-check store policy and SDK documentation at release; this document does not promise approval.
