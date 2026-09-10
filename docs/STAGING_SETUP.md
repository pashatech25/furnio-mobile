# Furnio Mobile staging setup

Status: schema and basic authenticated hosted API integration PASS on 9 September 2026. See `STAGING_INTEGRATION.md` for the current handoff, exact deployed resources, TLS resolution and verification evidence. No production configuration changed. Native staging builds and remaining provider/store integrations are now in progress.

**Current overrides:** 59 reviewed migrations are installed; 107 public tables have RLS; three synthetic accounts exist; two staging Workers and separate JWKS KV are deployed. Actual hosted SQL (19 checks) and authenticated API acceptance (nine grouped checks) pass. API keys are held only in ignored protected files/Worker secrets. Strict TLS is resolved with the official pinned provider CA. Public-only native configuration is prepared, purchases remain disabled. No production customer data is copied. The creation-era notes below are historical, not instructions to recreate/reapply this work.

## Historical creation checkpoint — superseded by STAGING_INTEGRATION.md

- Name: **Furnio-Mobile-Staging**.
- Project reference: `bcrobmrimzkvfrnqarmv`.
- Dashboard: https://supabase.com/dashboard/project/bcrobmrimzkvfrnqarmv
- Organization: `mtbmdoltmytsmmpuklpw` (`alipashaamidi's Org`, Pro).
- Region: `us-east-1`; Micro compute; Postgres `17.6.1.166`.
- Created: `2026-09-09T22:17:26.812232Z`; CLI and dashboard report healthy.
- Actual new-project form quoted **$10/month additional cost** for Micro. No paid add-ons, larger compute, custom domain, GitHub integration or IPv4 add-on enabled.
- Read-only SQL executed through the staging dashboard returned **0 Auth users, 0 Storage objects, 0 public application tables**. No migrations applied and no real customer data copied.
- `.env.staging.local` contains this project's generated database password/reference/URL. Verified ignored by Git and mode `0600`; do not print, commit, load into Expo or copy into the app bundle. No API/service-role keys have been retrieved yet.
- Main's `supabase/.temp/project-ref` remains production `sgsjkgfwgxmlqcgyuyeh`. Do not relink Main to staging. Mobile app/Worker environment flags remain unchanged and disabled.
- Creation helper is scoped to the approved project/organization, refuses duplicate projects and refuses credential overwrite. First invocation was rejected locally for the CLI's required password flag before any project was created; one corrected invocation succeeded. No duplicate project exists.

**Next: reconstruct and verify staging schema and test-only configuration.** Approval/sign-in hold is resolved. Do not ask the owner to create staging again. Local native builds need no additional software. Other store-account, policy/retention, paid-test and release approvals remain separate.

Connection note for the next schema step: direct DB hostname did not resolve on this machine during the initial check. The dashboard's free session-pooler endpoint is `aws-0-us-east-1.pooler.supabase.com:5432`, user `postgres.bcrobmrimzkvfrnqarmv`; strict TLS verification using system roots failed. Do not disable certificate verification or alter laptop DNS/network settings. Obtain the provider's trusted database CA and verify the pooler certificate, or use an authenticated supported management path for migrations. The read-only dashboard SQL check above succeeded, so project health/emptiness are verified independently. Bootstrap dashboard metrics included startup errors; no claim that all provider logs are clean or that the application is integrated.

## Approval record

The owner explicitly said to create a new Supabase project for staging. This resolves the earlier project-creation approval hold. Target: `Furnio-Mobile-Staging`, Micro compute, us-east-1, in the existing Furnio organization (`mtbmdoltmytsmmpuklpw`, displayed by the CLI as `alipashaamidi's Org`). The approximate US$10/month additional compute estimate remains subject to checking the actual organization plan; no larger compute or paid add-ons are approved.

The owner subsequently signed in. Organization and price were verified before the CLI created the new project. No customer data, production credentials or live jobs should be copied. Do not change the existing Main production CLI link.

Local readiness update: `pnpm test:schema` now replays the complete **60-migration Main/Admin application schema** with **19 passing behavior checks**, including the newly found pending-phone native conversion edge case. See `FULL_SCHEMA_REPLAY.md`. This reduces schema uncertainty but does not validate hosted Auth/Storage or authorize provisioning/applying migrations.

## Verified account state

- Local Supabase CLI is authenticated to the organization containing `Furnio-Production` (`sgsjkgfwgxmlqcgyuyeh`, organization `mtbmdoltmytsmmpuklpw`, us-east-1).
- Fresh project listing now includes the dedicated staging project above, production and the same two unrelated projects. No production preview branch was created.
- The Supabase MCP connection lists another account's projects and cannot access Furnio. Do not reuse its unrelated staging projects or change that connection for other running tasks.
- Only the ignored staging setup credential file has the new database values. App/Worker runtime configuration is not connected yet. The mobile Worker contains deliberately unprovisioned staging resource names and disabled flags. Their appearance in source does not prove deployment.

## Approved project choice

The owner approved a new dedicated `Furnio-Mobile-Staging` project in Furnio's organization. Use the production region initially for representative integration behavior. It must have separate credentials and synthetic data; do not clone customer records, sessions, files, live provider keys or production jobs.

Supabase lists additional paid-plan Micro projects at approximately **US$10/month**, billed hourly; this is the database compute estimate, not an all-inclusive staging budget. Verify the actual organization's plan/checkout amount before creation. Usage, storage and other services can add cost. Do not add a custom domain, PITR or larger compute without separate approval.

Sources checked 9 September: [Supabase pricing](https://supabase.com/pricing), [compute pricing](https://supabase.com/docs/guides/platform/compute-and-disk), [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq).

## Execution sequence after approval

1. Record the new project reference/organization/region and confirm it is not a known production or unrelated project. Keep secrets in approved local ignored files or provider secret storage—not documents or the app bundle.
2. Reconstruct the **complete** current Furnio schema in staging. Reconcile Main/Admin migration order and applied history first. Do not blindly push every dirty migration: unrelated Stripe live-mode/reference-furniture changes exist. The isolated ledger fixture is useful evidence, not a full-schema baseline. No production migration or customer-data dump is authorized here.
3. Create separate staging media storage, queues/DLQs and namespaced Workers. Customer API, imaging service Workers and mobile support Worker must bind only to staging resources. Preserve the same processing code/Admin prompt selection. No deploy of an unchanged production Worker is needed.
4. Add staging-only OAuth clients/callbacks, challenge hostname and test SMS/email setup. Preserve all production callbacks/providers. Configure only test recipients; real SMS or FAL tests need their explicit usage approval.
5. Create synthetic customer, Admin and approved developer fixtures, valid package versions and prompt settings. Leave native sales, deletion and external delivery disabled. Verify permissions and all existing website flows on the staging website first.
6. Configure RevenueCat sandbox with store test products. App identifiers, accounts, agreements, prices and signing require owner participation. Stripe regression uses test mode/sandbox, never a live charge. Never grant store sandbox purchases into production.
7. Enable one staging capability at a time and exercise signed-in mobile/web ownership, all nine services, purchases/restore/renewal/refund, concurrency and provider-aware billing. Record actual requests/results without credentials or unnecessary personal data. Complete deletion/retention and notification implementation/acceptance before release.
8. Produce signed private builds for physical-device TestFlight/Play testing. Public submission remains a separate owner-approved gate after the release checklist passes.

## Still not authorized by this document

Paid resources beyond the approved Micro staging project, live charges/model calls, modifying production login or tax settings, copying real customer data, production migrations/deployments, publishing store products or submitting either app. `RELEASE_GATES.md` remains authoritative.
