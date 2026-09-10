# Furnio Customer App — iOS and Android Implementation Plan

## Current approved scope — revised 9 September 2026

**Website-only purchases.** The owner replaced in-app purchasing with a free companion app using the same Furnio account, projects and existing website credits. Follow [WEB_PURCHASES_DECISION.md](WEB_PURCHASES_DECISION.md) for the new build sequence, store restrictions, remaining release gates and production-protection boundaries. RevenueCat, native product setup, native payment/ledger rollout and native billing compatibility are deferred—not release requirements.

Current definition of done: customers can sign in, use all enabled services with their existing shared credits, and see the same projects/balance as the website, with passing website regressions, complete privacy/deletion workflows and store acceptance of the companion model. Purchases remain on Furnio.ai; do not promise a checkout link in every storefront.

## Original plan — preserved history, native-commerce sections superseded

Approved by the owner on 2026-09-08. This document records the agreed scope. Completion is tracked separately in PROGRESS.md; this is not a claim of delivery.

## 1. What we’re building

Build a genuine native customer app using React Native, Expo and TypeScript, matching the approved Furnio mobile prototype—not a website inside an app.

Confirmed decisions:

- Launch on Canadian and US storefronts.
- Customers can purchase subscriptions and credit packs inside the app.
- Website purchases remain USD through Stripe. App purchases use Apple/Google storefront pricing.
- The same Furnio account, projects, images and spendable credits work across website and app.
- Use RevenueCat to coordinate native purchases; do not migrate existing Stripe billing.
- Native-purchased credits, including monthly grants, do not expire. Existing website credit and rollover rules remain unchanged.
- Use a separate repository at `/Users/alipashaamidi/Dev/Furnio Mobile`, with independent dependencies, builds and releases.
- Preserve the approved cream, forest-green and terracotta branding, actual Furnio logos, readable typography and native navigation.

Protection principle: the website remains an independent product. No web redesign, authentication rewrite or image-processing rewrite is included. Zero risk cannot be guaranteed, but isolation, backward-compatible changes and release gates will minimise it.

## 2. App screens and customer functionality

Build and test the app in stages, with all nine currently enabled services included before public release.

| Area | Included functionality |
|---|---|
| Welcome and authentication | Sign in, signup, Google, Sign in with Apple on iOS, existing email/password flows, password recovery and phone verification |
| Home | Shared credit balance, recent projects, current processing and clear service shortcuts |
| Projects | Project creation, listing, details, history, supported batch operations and existing archive behaviour |
| Create | Service selection, photo/file upload, service-specific controls, review and confirmed credit cost |
| Processing | Real server status, progress states, safe retry handling and partial-failure explanations |
| Results | Before/after comparison, image selection, supported disclosure settings, save and native sharing |
| Activity | Job history and optional completion/failure push notifications |
| Credits and plans | Native subscriptions, credit packs, purchase status, shared balance, transaction history and provider-specific subscription management |
| Account | Profile, preferences, support, privacy, sign out and account deletion |

Service coverage: Virtual staging; matched multi-view staging; item removal; custom staging; twilight; winter to summer; exterior enhancement; floor plans; reference furniture.

Each service will reproduce its actual current inputs and restrictions. Mask drawing, multi-view ordering, furniture references and floor-plan uploads will have proper native controls—not generic forms.

Additional defaults:

- Phone-first, English, approved light theme; responsive tablet layouts.
- Accessible controls, dynamic text sizing, safe areas and keyboard handling.
- Local draft recovery and clear interrupted-upload handling. No offline generation.
- Server-derived costs, permissions and feature availability.
- No Furnio Focus game or referral acquisition screens in v1. Existing awarded credits remain usable; Stripe-specific coupons remain website-only.

## 3. Shared account, APIs and billing

### Authentication and processing

- Use the existing Supabase customer identity and verified customer API permissions.
- Store sessions in platform-secure storage; never bundle administrative, provider or service-role keys.
- Add native authentication callbacks and Apple configuration without replacing existing web callbacks or providers.
- Existing customers retain their account ID. Do not merge accounts merely because names or email addresses appear similar.
- Preserve phone verification, resend limits, country preselection and Turnstile protection through a restricted mobile challenge flow.
- Send processing requests through the existing customer APIs and service Workers.
- Preserve Admin prompts, prompt snapshots, service settings, trial restrictions, watermark rules and credit checks.
- The app must never call FAL directly or substitute its own master prompts.

### Additive mobile backend

Create a dedicated mobile Worker for versioned mobile-only support APIs: purchase reconciliation, device registration, notification delivery and account deletion.

Add narrowly scoped tables for native product mappings, subscriptions, verified transactions and registered devices. Existing processing endpoints and database access policies remain compatible.

Notifications will be handled separately from image processing. A delayed or failed push must never fail an imaging job.

Account deletion requires recent authentication and an explicit warning that it deletes the shared Furnio account, including website access. Implement provider-token revocation, session invalidation, media cleanup and required financial-record retention. Explain that store subscription cancellation is separate.

### Purchases and shared credits

- Map approved Apple/Google products to immutable versions of existing customer packages—not developer plans.
- Match existing USD base prices and credit quantities as closely as store price points permit; display the actual price returned by the store.
- Verify high-priced package availability and any required pricing approval before release. Never silently change a package to fit a store limit.
- Identify RevenueCat customers using their authenticated Furnio user ID.
- Grant credits only after server verification, never from a client “purchase successful” message.
- Make purchase delivery idempotent across callbacks, webhooks, reconciliation, retries and restores.
- Isolate sandbox transactions so they cannot grant production credits.
- Handle renewals, pending purchases, cancellations, grace periods, expiration, refunds and restored purchases.
- Cancellation stops future renewal; it does not erase previously purchased native credits.

Native subscriptions will have their own records. Apple/Google IDs must not be inserted into Stripe subscription fields.

Native credits enter the existing shared ledger with distinct source attribution. Preserve current Stripe credit-spending priority; consume existing non-expiring web credits next, then native credits in grant order. Reserve/refund operations must retain that attribution.

Verified store refunds recover only recoverable native credits automatically. Spent-credit shortfalls go to an audited Admin follow-up rather than weakening existing insufficient-credit protections.

### Necessary website and Admin additions

A completely unchanged website would misidentify native subscriptions as missing Stripe subscriptions. Therefore, include these limited compatibility changes:

- Show whether a subscription is billed through Stripe, Apple or Google.
- Direct subscription management to its correct provider.
- Show native credit transactions without trying to fetch Stripe invoices for them.
- Guard against accidentally starting a second subscription across providers.
- Add native subscription/payment visibility and reconciliation alerts in Admin.
- Keep Stripe and native revenue sources distinguishable; do not count both as the same payment.

Customers with no native purchases retain their existing billing behaviour.

## 4. Verification and website-protection gates

Before implementation, record the current Git remotes, deployed versions and baseline tests. Preserve unrelated work already in progress.

Testing must cover:

- Existing website login, signup, SMS verification, trials, admin credit grants and Stripe checkout.
- Existing coupons, Focus rewards, referral behaviour and developer access.
- All nine mobile services, including masks, references, multiple views, batches and file validation.
- Equivalent web/mobile requests selecting the same Admin prompts and processing settings.
- Credit spending simultaneously from website and app without double spending.
- Duplicate purchase events, delayed webhooks, restore after reinstall and account switching.
- Cancellation, renewal, refund during processing and failed-job credit restoration.
- Website rollover never expiring native credits.
- Cross-account access rejection for projects, images, purchases and device registrations.
- Backgrounding, interrupted uploads, poor connectivity, accessibility and physical iOS/Android devices.

Use isolated development/staging configuration and store sandbox purchases first. No live charges or paid model-generation tests without approval.

New shared functionality starts behind disabled flags. Deploy additive migrations and compatibility changes before enabling native purchases. Do not deploy unchanged imaging Workers unnecessarily.

Rollback disables new app purchases or mobile entry points while preserving paid transaction processing and reconciliation. Never delete purchase records or reverse database migrations as a routine rollback.

## 5. Build sequence and launch requirements

1. Foundation: save this plan, establish baseline tests, create the separate repository and freeze the initial API contract.
2. Native UI: implement the approved screens and interactions using clearly labelled sample data.
3. Customer integration: connect authentication, verification, projects, uploads, all services and results against staging.
4. Native commerce: configure RevenueCat and store products; implement verified credits and provider-aware billing.
5. Release readiness: complete push notifications, privacy disclosures, account deletion, regression testing and operational monitoring.
6. Private testing: distribute through TestFlight and Google Play internal testing.
7. Public release: obtain your acceptance, submit for store review, then roll out gradually in Canada and the US.

Owner involvement:

- Activating the Apple Developer membership.
- Signing into Apple, Google and RevenueCat when configuration is required.
- Approving store agreements, commercial details and final USD/CAD product prices.
- Approving accurate privacy disclosures, including photo processing by third-party AI providers.
- Testing private builds and approving public submission.

Existing website tax settings and advertising tags will not be changed. No new advertising tracking is included; diagnostics must exclude photos, credentials and unnecessary personal information.

Definition of done: customers can sign in, purchase inside either app, use all enabled services and see the same account balance and work on the website—with verified native billing and passing website regression tests.
