# Full Furnio application-schema acceptance

9 September 2026. Local verification only; production is unchanged.

## Outcome

`pnpm test:schema` replays **60 actual Main/Admin migrations**, including all **25 native/mobile migrations**, then passes **19 acceptance checks**. The complete migration sequence SHA256 is `5128d50b067698d0d125f04cc688e9078bfa7717e46b0b3e4a7c8d0bc82ca1a7`.

The new runner uses a unique labelled PostgreSQL 17 container, an already installed image, `--network none`, no published ports, no host mounts, and a RAM-only data directory. It verifies ownership before removing that exact fixture. Unrelated Docker containers are not stopped or modified.

Every Furnio application table, enum, foreign key, check, policy and trigger comes from the original migration files. Only Supabase-owned Auth/Storage objects are test stand-ins. Main/Admin share one timestamp (`20260828032738`); the runner explicitly applies Admin's package entitlement before Main's property functions and rejects unexpected additional timestamp collisions.

## Bug found and fixed locally

A native grant to an active trial passed, but a native grant to a `pending_phone` trial failed the real `trial_entitlements_dates_check`. That trial had never started, so conversion produced a `converted` row with no start/expiry dates and rolled back the purchase transaction. The old simplified ledger fixture did not carry this constraint and could not detect it.

New unapplied migration: `../AI Virtual Staging/supabase/migrations/20260909215817_native_unstarted_trial_conversion.sql`.

The migration preserves the installed date expression and adds only a `converted` / `native_purchase` case with a recorded conversion timestamp and both trial dates absent. It creates no activation dates, grants no phone verification, does not backfill customers, and does not change the existing shared trial-conversion function. The runner checks that function's definition remains byte-identical across this migration. Normal active trials, non-native conversion sources, missing conversion timestamps, partial dates and null sources still fail validation as appropriate.

This is a native-specific compatibility correction, not a fix to or redesign of the legacy Stripe/admin trial-conversion rules.

## Verified cases

- Commerce and account-deletion rollout switches start disabled.
- Actual signup triggers create profiles, retain required phone verification and do not invent absent consent.
- Native mappings use real constrained customer package versions.
- Actual service-role purchase grants are idempotent; cross-account restores and mixed environments are rejected.
- Active and never-started trial conversions work without bypassing phone verification or inserting Stripe identifiers.
- Real job foreign keys/enums, failed-job triggers and refunds preserve native credit attribution.
- Existing customer RLS isolates projects; browser roles cannot enumerate native transactions or invoke native grants.
- Real-schema automation excludes native subscribers from the no-subscription audience; the original Admin Stripe view remains Stripe-specific.
- Spending consumes Stripe subscription credits, then non-expiring web credits, then native credits. Mixed-source refund restores all three; Stripe expiry leaves native/web non-expiring credits intact.

## Limits and honest test history

The initial **59-migration replay passed**, then the first complete-schema behavior run exposed the pending-phone constraint failure. The correction raised the count to 60. An expanded test initially called the existing expiry function with the wrong argument count; only the test was corrected to its actual four-argument signature. The final 60-migration / 19-check run passed.

This is stronger application-schema coverage, **not hosted Supabase certification**. Auth/Storage services, actual JWT/session lifetimes, hosted grants/advisors, migration-history drift, store payloads, SMS, external queues and real provider calls remain staging gates. The bootstrap models the existing application's legacy public default grants; staging must verify its actual defaults. No production credentials/data enter this suite.

`test:ledger` remains the earlier 24-migration minimal-fixture unit/concurrency suite; `test:schema` adds complete-schema coverage and is required for the 25th date-constraint migration. It must not be described as another minimal-fixture pass or as store readiness. Mobile/native builds and unchanged test suites were not rerun for this SQL-only correction.

The full local replay deliberately includes historical/unrelated migration files to reconstruct the application schema. **It is not authorization to bulk-push those files to staging or production.** Reconcile hosted history and review unrelated Stripe/reference-furniture migrations first.

Source inventory still covers 123 application tables; only the reviewed migration hash was added. Supabase security guidance informed explicit role checks and keeping platform stand-ins distinct from hosted acceptance.

## Next gate

Owner approval for a dedicated Furnio staging project remains pending; see `STAGING_SETUP.md`. No paid project, deployment, Git push, native rebuild or new listening port was created for this milestone. Retention policy, complete account deletion, store account/product setup, authenticated integration and physical-device acceptance remain unfinished.
