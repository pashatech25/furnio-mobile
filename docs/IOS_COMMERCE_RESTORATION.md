# iOS commerce restoration — 2026-09-15

## Approved scope

**Latest owner decision:** no second Supabase project or additional compute
charge. Keep production identity/API credentials. Implement separately accounted
Apple sandbox receipts in the existing production project; never credit the
production ledger from sandbox evidence. This supersedes separate-project staging
references below.

Restore iOS subscriptions and credit packs through the existing RevenueCat
project. Preserve Stripe website billing and the current Android closed-test
release. Match website USD package prices and quantities where store tiers allow;
owner approval is required for final CAD pricing and any unmatched package.
Native credits do not expire. Shared account identity and processing rules remain
unchanged. Improve account-deletion discoverability and resubmit both rejection
responses with physical-device evidence.

## Implementation order and release gates

1. Preserve dirty worktrees; inventory deployed revisions and live migration
   history before applying any additive migration.
2. Restore iOS-only SDK linking and wallet purchase/recovery UI. Android must not
   initialize the SDK or acquire a new checkout path.
3. Verify existing server transaction validation, durable intents, idempotent
   grants, native credit attribution, refunds and cross-provider subscription
   protection. Do not treat preserved code as production-certified.
4. Establish isolated sandbox billing and review-account routing. Sandbox
   transactions must not grant live customer credits; reviewer sandbox purchases
   must still deliver usable isolated test entitlements.
5. Configure Apple products and RevenueCat verification against immutable
   customer package mappings. No developer products, family sharing or intro
   offers in this release.
6. Deploy additive compatibility changes behind disabled acquisition flags.
   Verify web Stripe, trials, credit grants, concurrent spending, restore,
   interrupted checkout, refunds and account switching.
7. Verify deletion reauthentication, confirmation and cleanup, including iPad
   navigation and the review account. Retain legally required payment records
   for seven years. Explain subscription cancellation separately.
8. Test a signed build on physical devices, obtain necessary owner price/testing
   approvals, upload the next unused iOS build and submit purchases plus updated
   review evidence. Confirm the actual submission state.

Rollback disables new acquisition, not reconciliation of paid transactions.
No unrelated imaging/prompt changes or unchanged Worker deployments. Existing
website tax settings stay unchanged. Live charges/paid generations require
specific authorization.

## Current checkpoint

- iOS-only commerce policy added; Android remains excluded by policy.
- iOS wallet purchase and recovery panel added behind configuration/server gates.
- Account menu now explicitly says “Delete account”.
- SDK autolinking now resolves RNPurchases on iOS and excludes it on Android;
  verified with Expo's native dependency resolver. Native build not yet rebuilt.
- Store setup, deployed backend readiness and sandbox lane remain outstanding.
- No production purchase flag enabled; no deployment or store submission made.
- Full current suite: 1,172 tests passed across 80 files; TypeScript and diff
  checks pass. New wallet UI has not yet received physical-device validation.
- With explicit owner authorization, created the dedicated Apple in-app purchase
  key named Furnio RevenueCat iOS and uploaded it to RevenueCat. The private key
  is outside the repository with owner-only filesystem permissions.
- RevenueCat App Store configuration `app7734690df5` in project `7d9afb63`
  now uses bundle `ai.furnio.app`. Dashboard confirmed “App created successfully”
  and “Valid credentials” on 2026-09-15. Existing Apple keys were not modified.
- Product configuration, server notifications, backend verification credentials,
  sandbox purchase validation and submission are still pending. This connection
  alone does not enable purchases or submit the app.

## Implementation checkpoint — September 15, 17:30 Toronto

- Backend readiness now requires verification configuration, queue availability,
  and explicit acquisition/read flags; Apple acquisition is allowed only when
  ready. Android purchase intents remain rejected. Recovery is independently
  gated from new acquisition.
- Added migration `20260915212218_native_account_deletion_billing.sql` in the
  main repository to restore native subscription warnings removed during the
  website-only switch. The isolated ledger suite passes with this migration;
  this does not establish that the migration is installed in production.
- Supabase management returned scheduled maintenance through 21:45 UTC; live
  migration inventory and application remain pending, not assumed complete.
- iOS archive accepts explicit `--native-purchases`, reading only a public Apple
  SDK key from ignored `.env.ios-commerce.local`. Shared/Android build defaults
  still disable purchases and reject that additional configuration. Eight Node
  build-environment tests pass. No archive was built or uploaded at this step.
- RevenueCat read-only server-key authorization requested. Product setup,
  sandbox isolation, deployment, real purchase tests and submission remain open.
- Configured iOS wallet refresh now reads the complete native-aware billing
  snapshot when the server enables it; Android/unconfigured builds retain the
  web adapter. Four executable adapter tests cover balance non-addition,
  provider attribution, disabled-server fallback and surfaced native failures.
- Purchase-screen refresh invalidates stale requests on blur and clears old
  offers before rechecking capabilities. Foreground return refreshes offers
  outside an active store operation. Physical payment-sheet behavior remains
  unverified. Full suite now passes 1,176 tests across 81 files.
- Apple draft consumable created and confirmed in Prepare for Submission:
  `ai.furnio.app.credits50.v1`, Apple ID `6812524379`, reference name
  Furnio 50 Credit Pack. No price/availability/localization configured yet;
  not added for review.
- Current RevenueCat documentation confirms customer event history requires
  `customer_information:customers:read`, purchases require
  `customer_information:purchases:read`. Sandbox receipt handling remains a
  release gate; the existing production-only backend must not be enabled as-is.

### Apple draft product inventory

All seven product identities were created and confirmed in Apple. They remain
unsubmitted drafts without pricing, availability, localization or review images.
No live purchases enabled. Monthly plans belong to group `22387984`, Furnio
Customer Plans; created highest tier first. Final group ranking still requires
verification. Product names reflect web package names, not a new credit quantity.

| Web package | Apple product ID | Apple ID | Credits per purchase/renewal |
|---|---|---|---|
| credit_pack_50 | ai.furnio.app.credits50.v1 | 6812524379 | 50 |
| credit_pack_100 | ai.furnio.app.credits100.v1 | 6812524742 | 100 |
| credit_pack_300 | ai.furnio.app.credits300.v1 | 6812525060 | 300 |
| credit_pack_1000 | ai.furnio.app.credits1000.v1 | 6812525149 | 1000 |
| studio_1200 | ai.furnio.app.studio1200.monthly.v1 | 6812525498 | 1500 |
| pro_400 | ai.furnio.app.pro400.monthly.v1 | 6812525772 | 460 |
| starter_100 | ai.furnio.app.starter100.monthly.v1 | 6812525922 | 105 |

Credit quantities come from the live public package catalog inspected September
15; immutable database package-version mappings still need to be installed and
verified. Apple product identities alone do not grant these credits.

English (U.S.) localization saved and visibly verified for all three monthly
plans: Furnio 100 (105 monthly credits), Furnio 400 (460), Furnio 1200 (1,500).
Descriptions state purchased credits never expire. English (U.S.) localization
is also saved and verified for all four credit packs, stating the quantity,
one-time purchase and no expiry. Canadian localization remains pending.
No price or availability was enabled.

Live schema check: Supabase management read-only query returned HTTP 201 with
an empty list for tables in public/private whose names contain `native`.
Production therefore does not have the preserved native-commerce schema; do not
infer deployment from the passing disposable-database suite. Management access
has recovered from the earlier maintenance response.

Apple pricing preview (cancelled without saving): exact USD $50 and $800 price
points are available after “See Additional Prices”. Apple proposed CAD $70 and
$1,000 respectively. These are observed draft quotes, not approved prices.
Remaining price equivalents and subscription tiers must still be checked;
owner approval for final CAD amounts remains required.

Remaining pricing previews, cancelled without saving: consumable USD $100 →
CAD $129; USD $300 → CAD $400. Subscription USD $100 → CAD $129 and USD $400 →
CAD $500. Expanded subscription search for 1200 returned only $12.00, not
$1,200.00; the $1,200 plan remains unpriced. Asked owner to approve the six
matched USD/CAD prices and pursuit of higher-price approval for the final plan.
No prices saved, no quantity changed, no product removed from scope.

### Full-schema and live-inventory verification

Read-only production inspection found only five of the 76 functions defined by
the September 9 native/mobile migrations and September 15 deletion migration:
`private.mobile_account_deletion_receipt`,
`private.resolve_project_photo_limit`,
`public.get_mobile_account_deletion_review`, `public.get_mobile_activity`, and
`public.manage_mobile_account_deletion_request`. Existing deletion objects must
be preserved; an empty migration history is not permission to replay conflicting
CREATE statements over production.

`pnpm test:schema` replayed all 63 Main/Admin migrations successfully in an
owned RAM-only PostgreSQL container without network, ports or production data.
All 19 full-schema assertions passed, including native trial conversion before
phone verification, strict trial dates, transaction idempotency, cross-account
and environment rejection, real job refund triggers, spending priority and
Stripe expiry preserving native credits. Auth/Storage use stand-ins; this is not
a real purchase or deployed-database test.

Corrected an obsolete schema assertion that expected every deletion flag off:
the September 10 migration intentionally enables manual deletion intake. The
replacement asserts intake remains enabled and automatic cleanup/auth blocking
remain disabled. No production settings or migration contents changed.

### Owner-approved store configuration

Owner approved the key, isolated test setup, six quoted prices and pursuit of
higher-price approval. Saved Apple prices and Canada/US-only availability:

- credits50: USD 50 / CAD 70
- credits100: USD 100 / CAD 129
- credits300: USD 300 / CAD 400
- credits1000: USD 800 / CAD 1,000
- starter100 monthly: USD 100 / CAD 129
- pro400 monthly: USD 400 / CAD 500

All remain Prepare for Submission; none added for review. Consumable Canada
prices currently use Apple's automatic equalization, not a permanent Canadian
override. Future storefront auto-expansion was left unchecked.

Created RevenueCat v2 key “Furnio mobile verification read-only” with only
customers, subscriptions, purchases and products READ permissions. Verified its
masked dashboard row. It has NOT yet been transferred to Worker secrets or
validated by server requests; no credential value was printed.

Apple higher-price form requires implemented in-app refund request, refund/cancel
notifications, subscription management and consumption reporting (where
applicable). Do not assert these are complete or submit an inaccurate form.
URL: https://developer.apple.com/contact/request/app-store-higher-price-points/

Supabase connector belongs to a different organization (pasha2025dev's Org).
Do not provision there. Browser confirms correct organization mtbmdoltmytsmmpuklpw
(alipashaamidi's Org), containing Furnio-Production sgsjkgfwgxmlqcgyuyeh.
New-project draft “Furnio-Mobile-Commerce-Staging” shows additional US$10/month
Micro compute. Requested explicit cost approval; no project created yet.

### Same-project sandbox foundation — deployed

Owner explicitly authorized production deployment. Applied only
`20260915221508_native_sandbox_isolated_accounting.sql` to
`sgsjkgfwgxmlqcgyuyeh` through authenticated Management API (HTTP 201).
SHA256: `3ad49c7b6fbab05d7e520f08b3841bb20353638615e5b8dc5a049711867f7ad5`.
Direct SQL application does not create a migration-history entry; do not blindly
replay this CREATE migration on the deployed project.

Verified live: all three private sandbox tables empty, RLS enabled, anon and
authenticated cannot execute the grant RPC, service_role can execute but cannot
enroll sandbox accounts. No existing functions, real ledger, authentication
settings, Stripe settings or processing Workers changed. Synthetic purchases
cascade on profile deletion; they are not retained as real financial records.

Full-schema suite now includes sandbox duplicate-evidence, cross-account,
environment, allowlist and production-ledger non-mutation assertions. This is
only evidence storage and grant attribution: sandbox spending, refund handling,
verified-event routing, app display and actual StoreKit validation are still
required before activation. Do not claim native purchases are operational.

### Sandbox job accounting implementation (not deployed)

Added `20260915222311_native_sandbox_job_accounting.sql`: per-job idempotent
reservations, FIFO purchase attribution, owned failed-job refunds and verified
store-refund exclusion. Twenty-six full-schema checks pass across 65 migrations,
including failed-job refunds never resurrecting refunded store credits and no
production ledger mutation. This second migration has NOT been applied live.

Integration inspection: `apps/api/src/routes/jobs.ts` currently selects only
`paid_credit` or `free_trial`; `reserveRequestCredits` calls `reserveJobCredits`
for normal customer jobs. Submission-error paths call `refundJobCredits`.
Sandbox accounting must be selected by trusted server-side account enrollment
across quote, balance precheck, reservation and asynchronous failure/refund paths.
Do not connect just the purchase grant and leave jobs charging the real ledger.
Other service Workers' reserve/refund paths also require inspection before any
test-account rollout. No production processing code changed in this checkpoint.

### September 15 — continued implementation and signed build

- Registered all seven existing Apple SKUs in RevenueCat (four consumables,
  three subscriptions). No intro offers, annual commitment or new prices added.
  REST product IDs: credits50 `prodefc2fbf941`, credits100 `prodd4e9e4d9d9`,
  credits300 `prodb2f1d5f296`, credits1000 `prod9d8e07f9b2`, starter100
  `prodca30b5427b`, pro400 `prod6e5b69534e`, studio1200 `prode17eee5408`.
  RevenueCat cannot check store status without App Store Connect API credentials;
  product registration is not proof of an available StoreKit purchase.
- Configured the public Apple SDK key in ignored `.env.ios-commerce.local`
  (0600) and the production companion's non-secret project/app identifiers.
  Acquisition/reconciliation flags remain disabled. Device build now accepts
  the same explicit `--native-purchases` option as the store archive script.
- Added Apple refund-sheet UI for previously purchased catalog products, with
  account-change checks and distinct cancelled/submitted outcomes. No client
  refund result modifies credits. This still needs physical StoreKit testing;
  consumption reporting and higher-price approval are NOT completed.
- CocoaPods installed RNPurchases 10.9.0, PurchasesHybridCommon 18.33.1 and
  RevenueCat 5.87.1. Signed Release device build succeeded with production
  configuration and native purchases enabled. Build log:
  `output/ios-device-2026-09-15T22-35-31.383Z.log`.
  **Not installed on the phone and not uploaded to Apple.**
- Full mobile suite: 1,181 tests / 81 files pass; TypeScript and backend
  TypeScript pass; eight build-environment tests pass.
- Local sandbox job migration now provides a backend-only separate balance,
  zero balance for expired enrollments (never real-credit fallback), queued-job
  ownership validation and a real-ledger trigger rejecting sandbox job writes.
  Full-schema suite: 31 checks across 65 migrations pass. This migration remains
  UNDEPLOYED; job routing and sandbox receipt reconciliation remain unfinished.
- Cloudflare browser login expired while connecting the authorized RevenueCat
  verification secret. Sign-in requested. Secret is not stored in source or
  printed. No production Worker deployment, phone installation, purchase test,
  live charge or store submission occurred in this checkpoint.

### September 15 — Cloudflare login restored

- Saved `REVENUECAT_SECRET_API_KEY` as an encrypted production `furnio-mobile`
  secret and deployed the non-secret RevenueCat project/app IDs. No key was
  written to source or printed. Public capabilities remain purchase-disabled.
- Created and verified `furnio-mobile-native-events` and
  `furnio-mobile-native-events-dlq`; both have zero producers/consumers until
  the backend is deployed. Added their production binding configuration locally;
  Wrangler dry-run passes. No production imaging Worker was deployed.
- RevenueCat's current official webhook documentation explicitly supports
  timestamped HMAC signing. Preserve signature verification, not remove it.
  Its new-webhook form currently shows Authorization but no signing controls;
  inspect the saved integration for signing before enabling purchases.
- Corrected the local webhook response to HTTP 200 after durable acceptance,
  matching RevenueCat's documented delivery contract; failures remain non-2xx.
- Requested approval to configure purchase-event delivery to the mobile API.
  The webhook has NOT been created. Purchase flags remain disabled; this is
  not an end-to-end purchase validation or a store submission.

### September 15 — approved webhook configured

- Owner approved webhook setup and requested custom-domain verification.
  Cloudflare Domains shows `mobile-api.furnio.ai` as Production in `furnio.ai`;
  its HTTPS `/health` returns the production `furnio-mobile` service successfully.
- Created RevenueCat webhook `whintgr6e45452db3`, named
  `Furnio Apple purchase events`, restricted to App Store app `app7734690df5`,
  all event types, production and sandbox. Destination is
  `https://mobile-api.furnio.ai/v1/webhooks/revenuecat`.
- Enabled RevenueCat HMAC signing. Dedicated Authorization and generated HMAC
  secrets are stored encrypted on `furnio-mobile`, not in source or transcripts.
- Preserved the existing `furnio.ai/v1/challenge` route in local Wrangler config
  after observing it in live Cloudflare Domains. Do not drop it on deployment.
- Targeted webhook/Worker suite: 80 tests pass. Acquisition and reconciliation
  remain disabled; actual delivery, sandbox isolation, purchase fulfillment,
  phone installation and store submission are still outstanding.

### September 15 — production database rollout resumed

Applied and verified through the Management API to `sgsjkgfwgxmlqcgyuyeh`:

- `20260915222311_native_sandbox_job_accounting.sql`
  SHA256 `72e0a36a02e1692b6c3de27c799256162f503d2c991bdebb12b71579d3c53a86`
- `20260909042902_native_credit_reasons.sql`
- `20260909042919_native_commerce_foundation.sql`
- `20260909044746_native_commerce_events.sql`
- `20260909050004_native_billing_read.sql`
- `20260909053256_native_customer_compatibility.sql`
- `20260909054645_native_admin_visibility.sql`
- `20260909063152_native_purchase_recovery.sql`

These direct SQL deployments do not create migration-history rows: do not replay
them. The Stripe ledger function body exactly matched the tested baseline before
foundation deployment (SHA256
`631103b0809f26f67dc1e6d2c316e7faa9a011ab181bf19f343e87895ca2bcf1`).
Foundation adds its guarded native-refund branch and native attribution triggers;
it does not rewrite existing balances or enable purchases. The quota resolver
retains its original implementation in the private web fallback.

Live verification: acquisition, reconciliation and customer compatibility all
false; environment unset; zero native purchases/events/lots, zero sandbox
reservations/enrolled accounts. Authenticated clients cannot execute native
grant/event/recovery/Admin-read or sandbox-reservation RPCs. Server reservation
permission is present. Full local 65-migration/31-check schema suite passed
before deployment. No Worker code deployment, phone update or store submission.

Further production migrations applied and verified in this continuation:

- `20260909065713_native_purchase_intents.sql`
- `20260909072646_native_checkout_support.sql`
- `20260909102539_native_stripe_checkout_recovery.sql`
- `20260909113159_native_refund_reversal_reason.sql`
- `20260909113200_native_refund_reversal_recovery.sql`
- `20260909121424_native_sdk_cancellation_recovery.sql`
- `20260909130505_native_admin_reporting.sql`
- `20260909185306_native_subscription_overlap_reporting.sql`
- `20260909215817_native_unstarted_trial_conversion.sql`
- `20260915225611_native_commerce_private_rls.sql`

The final migration adds RLS and revokes direct service-role table writes on
three private tables; owner-executed service RPCs still pass the full schema
suite (66 migrations, 32 assertions). All five rollout flags plus reporting
remain false. No real transaction or purchase intent was created.

All seven approved Apple product IDs now have immutable PRODUCTION/APP_STORE
mappings to the existing current live USD customer package versions; every
availability row is false. The same package versions are mapped in the private
sandbox catalog. Credits verified: 50/100/300/1000 packs, 105/460/1500 monthly.
No existing package, Stripe price, tax configuration or customer balance changed.
Physical iPhone `00008150-000814C02202401C` was detected available and paired.

Still required: sandbox event/recovery/checkout routing and processing balance
integration; remaining deletion/automation compatibility deployed selectively;
Worker + web/Admin release verification; actual StoreKit tests; higher-price
request and remaining Apple metadata; next build installation/upload/submission.

### September 15 — website regression gate

- Rechecked live production database: acquisition, reconciliation, compatibility,
  checkout protection, cancellation recovery and reporting all remain false.
- API tests: 338 passed; web tests: 58 passed; mobile tests: 1,183 passed.
  Mobile Worker typecheck passed. Full isolated schema replay: 66 migrations,
  32 assertions passed. No live charge, processing request or production write.
- Added regressions for website discount eligibility/redemption, Focus coupon
  attachment and non-stacking, referral stacking restrictions, and unstarted
  checkout cleanup. Found and fixed a local pre-activation compatibility defect:
  discount validation could leave a reserved purchase intent behind. Cleanup now
  uses the existing conditional reserved-only RPC; launched payments stay locked.
  These code edits are NOT deployed.
- API full typecheck still reports four existing reference-furniture errors;
  no new billing errors. Do not claim the API build gate passed.
- Live `/app` redirects to the working sign-in screen in the browser session.
  Asked the owner to sign in for authenticated dashboard/billing checks. Live
  checkout, account UI and promotional end-to-end flows remain unverified.

### Submission completion objective — explicitly requested September 15

Complete verified iOS RevenueCat purchases, shared credits, provider-aware web
and Admin billing, and account deletion; preserve Stripe promotions and existing
processing behavior. Finish physical-device sandbox verification, Apple product
metadata and pricing requirements, signed upload, and confirmed review submission.
The goal tool refused replacement because the older blocked goal is unfinished;
it was not falsely completed. This checklist remains the execution objective.

### September 15 — authenticated live website checks

After the owner signed in, verified the production website in the browser:
- Dashboard loaded one existing property, three completed results, all nine
  service links, and a consistent 20-credit balance.
- Billing loaded all four top-ups and three monthly plans with expected pricing
  and credits. Opened real Stripe checkout for the $50 pack and $100/month plan;
  both displayed the correct product and amount. Returned via the cancellation
  links without entering payment information or completing either purchase.
- Referral screen loaded its existing code, program state and reward summary.
- Existing property and Twilight result opened; original and output images
  both loaded. An existing trial result also loaded with the protected-preview
  download control and permanent-watermark notice. No clean unlock was requested.
- No captured browser errors during the checked screens. Returned to dashboard;
  balance remained 20 credits. No charge, subscription or AI job was created.
- This verifies navigation, checkout creation and existing result delivery, NOT
  payment fulfillment, live coupon redemption, new trial signup or Focus rewards.
  Those remaining acceptance gates must not be represented as passed.

### September 15 — submission goal continuation

- Cleared the four previously recorded API TypeScript errors with narrow type
  fixes: preserve the validated non-null furniture key, copy PNG bytes to an
  ArrayBuffer for Blob, and assert against the existing R2 mock directly.
  No prompts, model choices or service request counts changed. API and web
  typechecks now pass; 338 API tests pass. These API edits are not deployed.
- Applied `20260915232726_native_sandbox_refund_ordering.sql` directly to production,
  SHA256 `d982427db6708abe868fe99de3c8f5aadedf43c9e3d6418a15399f510b9c198b`.
  It records prior sandbox refunds separately, rejects owner mismatches, and
  prevents a delayed purchase grant from making refunded test credits spendable.
  RLS and denied direct client/service-role table writes verified live. Purchases
  and reconciliation remain disabled. No production credit mutation.
- Added local `20260915232926_native_sandbox_event_inbox.sql` (NOT deployed) and
  Worker routing for HMAC-verified Apple sandbox events on the production identity
  environment. Separate inbox and queue messages; only privileged RPCs; account
  enrollment required. Independent RevenueCat verification precedes test grants;
  prior refunds are written before grants. Refund reversals quarantine for review.
  Worker edits NOT deployed. Checkout/recovery/billing and job test-account routing
  remain unfinished; do not enable acquisition based only on this inbox work.
- Verification: 1,187 mobile tests, Worker typecheck, 338 API tests, API/web
  typechecks, and 68-migration/37-assertion isolated schema suite pass.
- Asked whether the initial iOS release may omit only the $1,200/month product
  if Apple higher-price approval delays submission; no price or availability
  changed in response to that pending decision. Apple page was inspected only.

### September 15 — isolated purchase inbox deployment

- Deployed `20260915232926_native_sandbox_event_inbox.sql` to production;
  SHA256 `c5d37a95d307c235ed07ee0bfd96d7cb10e12d783b147cf87b2a6c96b05693b0`.
  This supersedes the earlier NOT-deployed note. Verified private-table access
  restrictions and empty inbox; no customer purchase or balance was changed.
- Deployed only `furnio-mobile`, version
  `651da1bb-c990-4c51-bd51-376142115f5b`, preserving variables/secrets and both
  `mobile-api.furnio.ai` and the existing `furnio.ai/v1/challenge` route.
  Previous rollback version: `ed552b79-73ff-49a8-8369-8cef48c27a88`.
- Post-deployment health returned OK/production. Capabilities still report
  commerce, billing, and purchase recovery disabled; deletion intake remains on.
  No imaging Worker, customer API, website or Admin was deployed in this step.
- This is infrastructure preparation, not a completed StoreKit purchase test,
  installed phone update, App Store upload or review submission.
- Added local-only `20260915234042_native_sandbox_checkout.sql`: privileged
  server-selected store context distinguishes active, expired, and non-enrolled
  accounts. It does not enable checkout. Full isolated schema replay now passes
  69 migrations and 40 assertions, SHA256
  `e7a7a14c6aa105b5ed888cea7e194500ffaf34c1180f9e27b823d55ff6f81cbf`.
- Removed hard-coded archive build 4. Store archives now require an explicit
  `--build-number=<unused number greater than 4>`. Ten build-environment and
  numbering tests pass. No archive or upload was started by this script change.
- Entered reviewer explanation on Apple product 6812525149. Product screenshot
  and full metadata review remain outstanding. No Add for Review action taken.

### Owner decision — omit high-price app subscription

Owner explicitly approved leaving the $1,200/month subscription out of the app.
Proceed with the other six Apple products; do not submit or expose
`ai.furnio.app.studio1200.monthly.v1`. Leave the website's $1,200 plan and Stripe
configuration unchanged. Higher-price approval is no longer a release blocker.
This decision does not complete remaining commerce integration, device testing,
Admin/customer deployment, build upload or review submission.

### September 15, 20:27 Toronto — completion work in progress

- Admin: 102 tests, typecheck and production build passed. Created a disabled
  release candidate `dpl_AxHpW8zLEQVVaWVRhom9NbktwTQr` at
  `https://furnio-admin-atooxq0gb-pashas-projects-d2c4e4dc.vercel.app`.
  Its unauthenticated native-reporting endpoint returned 401. Custom-domain
  promotion and authenticated native billing checks are NOT complete.
- Mobile: 1,190 tests and Worker typecheck pass. Full disposable schema replay
  passes 72 migrations and 56 assertions; no published Docker ports or live
  customer records were used by the suite.
- API: 347 tests and typecheck pass, including new checks proving disabled
  sandbox routing preserves the original credit path and routing failures never
  fall back to real credit refunds. API changes remain local, not deployed.
- Applied the following additive migrations to production with all native
  commerce flags still false and zero sandbox enrollments/intents/recovery runs:
  - `20260915234042_native_sandbox_checkout.sql` SHA256
    `7ee1f3bf672fa21b9215dc38ab2b71d7d896ba9d24a3ef172e4bcf9e1b93cc62`
  - `20260916001354_native_sandbox_recovery.sql` SHA256
    `07e5187e220b0b7b118a4f9c7fe374d6dac33eeeab7baa8f6b8c4c3449efef9d`
  - `20260916001553_native_sandbox_checkout_cancellation.sql` SHA256
    `70367bfcd7143bda3679194d50dfe7160499c47aab58ab6d32c3c466b5cef3d5`
  - `20260916001806_native_sandbox_job_routing.sql` SHA256
    `125ad23bc299997ad0cd3ac9dfe6603645ff9c475db0b0a37abd79ca24f349df`
- Verified live clients cannot execute sandbox job routing and service-role
  direct checkout inserts are denied. No customer balance or purchase changed.
- Physical iPhone 17 Pro Max remains paired/available. Started a fresh signed
  production-identity iOS build with native purchases included; build/install
  and real sandbox purchase outcomes must be recorded separately.
- Outstanding integration detail: sandbox batch reservations and processing
  consumer flags must be verified before spending sandbox credits on jobs.
  New shared routing must not be enabled only on the API while consumers still
  use the real ledger. No imaging Worker was deployed at this checkpoint.
- Production mobile Worker deployed successfully as
  `8512fdf2-dc2e-47e2-94cf-dba588cbbd27`; rollback revision is
  `651da1bb-c990-4c51-bd51-376142115f5b`. Both existing routes preserved.
  Live health is OK; commerce/recovery/billing remain false; existing account
  deletion review/intake and activity remain true. No real purchase enabled.
- Fresh signed native-purchase iPhone build passed embedded production-identity
  validation and installed successfully on paired iPhone 17 Pro Max
  `00008150-000814C02202401C`. This is a development-signed device installation,
  NOT an App Store upload or proof of a successful StoreKit transaction.
- Asked the owner whether an Apple Sandbox Account is already signed in on the
  phone. Never use the owner's normal Apple purchase account for a live charge
  to bypass this test gate. No test purchase has been initiated.
- Device launch was refused by iOS because the phone is locked (CoreDevice
  10002 / FBSOpenApplicationErrorDomain 7). Installation succeeded; launch and
  physical verification did not. Asked owner to unlock it. Do not label this
  an application crash or a passed launch check.

### September 15 — owner sandbox purchase gate activated

- Completion goal active: finish integration and physical validation before
  final Apple submission; no assertion of approval or completion.
- Verified owner-selected account `444b8041-ec4a-47a6-bebb-924dcd2c8bc0`
  is active, phone verification not required, no active jobs or Stripe subscription.
  Enrolled for 48 hours in private sandbox accounting; real balance remains 15.
- Removed only unused sandbox catalog entry `ai.furnio.app.studio1200.monthly.v1`
  in accordance with owner omission. Immutable production mapping and web plan
  unchanged; catalog entry can be recreated from its existing package mapping.
- Set database native environment to PRODUCTION with ALL native commerce
  booleans still false. Enabled mobile Worker billing/reconciliation/acquisition
  gates, with actual eligibility selected server-side by sandbox enrollment.
- Deployed mobile Worker `9fefb21a-be71-496a-8ff0-df49aa653761`;
  rollback `8512fdf2-dc2e-47e2-94cf-dba588cbbd27`. Existing routes preserved.
  Live capabilities report commerce/recovery/billing ready. This does not mean
  ordinary production customer purchases are enabled.
- 61 focused billing, readiness, intent and event tests plus Worker typecheck
  and Wrangler dry-run passed. Owner asked to inspect device catalog only.
  No StoreKit purchase verified and no new Apple submission yet.
- Owner reported the account balance displayed 0 instead of 15. Fixed mobile
  billing to return the real shared balance/subscriptions/history and a separate
  sandbox object; regression verifies real=15 and test=50 are not interchanged.
  Deployed `b58d6c70-f537-4a7d-acf1-e0b88f541808` after billing tests/typecheck.
  No ledger mutation. A separate labelled sandbox notice is added locally and
  needs device rebuild; installed app can already read corrected real balance.
- Physical device launch succeeded. Full 1,190 tests and mobile typecheck passed
  before the labelled-notice edit. Awaiting owner's catalog observation.
- Owner confirmed real balance restored but no purchasable products displayed.
  Catalog now loads before optional refund history, with distinct empty-StoreKit
  feedback and safe gate/count-only diagnostics. Updated device build installed
  and launched successfully at 21:10 Toronto; console session 55907 is attached.
  No StoreKit diagnosis or successful purchase claimed yet. Owner asked to open
  View credits and report the displayed notice / screenshot.
- Direct Apple Business inspection found Free Apps Agreement Active but Paid
  Apps Agreement New / View and Agree to Terms. Opened its agreement dialog
  for owner review; checkbox and Agree untouched. This is a verified blocker
  for StoreKit sandbox products (RevenueCat iOS product setup documentation
  explicitly requires the signed Paid Apps Agreement). Banking/tax status must
  be checked after owner acceptance. Do not keep rebuilding to bypass this.
- Latest ledger concurrency suite and frozen contracts pass. Catalog unit tests
  prove both store categories requested without requiring refund history and no
  prices invented for empty StoreKit responses. Mobile/Worker typechecks pass.
- September 15, 21:18 Toronto: full mobile suite rerun: 1,192 tests across 81
  files passed; `pnpm typecheck` passed. This is not physical StoreKit evidence.
- Apple Business now confirms Paid Apps Agreement effective September 15 with
  status **Pending User Info**, replacing New. Bank account is not configured;
  Canadian GST/HST Form 506 and U.S. Tax Questionnaire each show Missing Tax
  Info. Owner asked to complete these directly; no financial/tax declarations
  entered on the owner's behalf. Native purchasing remains a release blocker.
- Device console session 55907 ended with a CoreDevice connection invalidation;
  it is no longer attached. Reconnect diagnostic capture before reporting any
  fresh device catalog result. No new archive upload or review submission made.
- Local API rollout safeguard: sandbox job routing now requires a separate
  `NATIVE_SANDBOX_PROCESSING_ENABLED` flag (default false), not the customer
  native-billing visibility flag. Regression proves billing enablement alone
  preserves the real balance/reserve/commit/refund endpoints. Generated Worker
  types, all 348 API tests, and API typecheck pass. This change is NOT deployed;
  sandbox batch/consumer acceptance still precedes sandbox-processing enablement.
- Current integration verification: customer web 58 tests/15 files and typecheck
  passed; Admin 102 tests/16 files, typecheck and production build passed.
  These are local checks, not confirmation that disabled compatibility features
  have been enabled or visually accepted in production.
- September 15, 22:04 Toronto: live owner context confirmed active sandbox
  enrollment, acquisitionEnabled=true and six catalog products; public mobile
  capabilities billing/commerce/recovery all true. Apple business previously
  advanced to Processing with all tax forms Active and bank Processing.
- Added a bounded local cache diagnostic (`Library/Caches/furnio-commerce-diagnostic.json`)
  with loading stages and allowlisted booleans/counts only (no identity, tokens,
  receipts or raw errors). 1,194 tests and typecheck pass. Device build
  `output/ios-device-2026-09-16T02-02-53.909Z.log` succeeded and installed at
  app container A2FC1E48-D8DF-4AAA-8E0C-ECD7FB928428. iOS refused launch because
  device was locked. Owner asked to unlock/open View credits; diagnostic file
  not yet present. Do not claim the store-loading cause or purchase verified.

### September 22 — Apple catalog unblocked and physically verified

- App Store Connect now shows the Paid Apps Agreement, Royal Bank account and
  all submitted Canadian/U.S. tax forms Active. The six intended Furnio
  products remain limited to Canada and the United States and each remains
  Prepare for Submission with its App Review screenshot still missing.
- The owner's private sandbox enrollment had expired on September 18 during the
  one-week pause. Extended only account
  `444b8041-ec4a-47a6-bebb-924dcd2c8bc0` for 48 hours; ordinary customers,
  Stripe billing, production credits and website promotions were not enabled or
  changed.
- Fresh physical iPhone diagnostic at 09:36 Toronto proves the signed local
  purchase build is configured and signed in, mobile billing/commerce are ready,
  the server returned six catalog entries, and StoreKit returned all six
  products (`storeCount: 6`). This supersedes the September 16 zero-product
  result recorded while Apple's paid agreement was not active.
- RevenueCat still lists the App Store products as `Could not check` because its
  App Store Connect API credential is absent; its separate in-app-purchase key
  is present and marked Valid. No sandbox purchase, webhook grant, restore,
  refund or reconciliation has yet been verified.
- App Store Connect and local source both report 1.0.0 (4), but the uploaded
  build 4 predates the local native-purchase changes. The next upload must use
  unused build number 5 after sandbox acceptance and final metadata updates.
