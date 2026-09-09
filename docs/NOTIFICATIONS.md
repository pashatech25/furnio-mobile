# Furnio Mobile — optional photo updates

Implemented locally on 9 September 2026. **Disabled, unapplied and not device-certified.** No real push was sent. This document describes the code, not a production capability.

## Customer behaviour

- Account → Photo updates is explicit opt-in. A new installation or a different Furnio account is not opted in automatically.
- The app creates the Android `jobs` channel before asking permission. iOS requests alerts/sound, not badge counts. A physical device and configured Expo project are required.
- Notifications say only “There is an update in Furnio. Open the app to view it.” They contain no image, address, customer name, balance, prompt or job ID.
- Tapping the fixed, versioned payload opens Activity only after customer sign-in/verification. External URLs and additional payload fields are rejected. Activity remains the source of truth.
- Foregrounding renews an opted-in installation without showing another OS permission prompt. Native token changes trigger re-registration. Revoked OS permission triggers server disable.
- The app switch disables server delivery, not just the OS display. Sign-out first journals a disable request; an expired session is not needed to disable that installation. Website sessions are unchanged.
- Offline disable is visibly pending. The stored cleanup is retried on next app foreground/account change. Already accepted APNs/FCM messages cannot be recalled; only generic content is ever sent. If the app never reconnects, the server stops at the 30-day registration lease at the latest.

## Authenticated installation boundary

The native app stores a random installation UUID, 256-bit secret, monotonic revision and opt-in state in device-only secure storage, namespaced by app environment. No administrative key is bundled.

1. An authenticated customer prepares an installation before registering a push token. This acknowledged preparation cannot enable delivery by itself.
2. Registration uses a newer revision and freezes the checked customer's bearer token for that request.
3. Before transport, the app persists an even newer cleanup revision. A lost response therefore leaves a recoverable disable intent, not an assumed success.
4. The Worker hashes the installation secret with SHA-256; only the digest is stored in the private table.
5. The server atomically rejects stale revisions and wrong capabilities. Anonymous disable cannot create a record, read customer data or send a message.
6. Account/token/enable changes advance a separate binding version and cancel older queued deliveries. Routine renewal preserves the binding and opt-in timestamp.

The push token itself is sensitive and private, not proof of identity. Authenticated preparation is bounded to ten retained installations per customer; active registration is also limited to ten. Staging must add normal edge rate limits for abusive repeated authenticated registrations and unknown disable attempts before public exposure. Device attestation is not implemented or claimed.

## API contract

All operations use HTTPS POST, strict JSON, a 2 KiB body limit, no query string and no browser `Origin`. Responses are `{ "enabled": boolean }` with no-store/security headers. Environment and configured Expo project come from the Worker.

| Endpoint | Identity | Body |
| --- | --- | --- |
| `/v1/devices/prepare` | Existing authenticated customer API gate | installationId, installationSecret, revision |
| `/v1/devices` | Same customer gate | preparation fields plus platform (`ios`/`android`), pushToken, projectId |
| `/v1/devices/status` | Same customer gate | installationId, installationSecret, revision; only returns this customer's matching opt-in state |
| `/v1/devices/disable` | Installation capability only | installationId, installationSecret, revision; no customer ID accepted |

Disable remains available when app-entry or new notification registration flags are off. Its configured environment/project must still match. Removing the Worker route, credentials or database prematurely would prevent offline cleanup; leave that narrow route available through a rollback.

## Independent delivery pipeline

Migration `20260909074924_mobile_push_notifications.sql` adds private settings, devices and a durable delivery outbox, plus a partial terminal-job index. Tables have RLS and no generic public/authenticated/service-role access; the Worker uses narrow service-only RPCs. **There is no new trigger on jobs and no imaging Worker change.**

The mobile Worker's separate minute cron:

1. Polls authoritative `succeeded`/`failed` jobs finished after opt-in and within 24 hours, excluding purged jobs and inactive accounts. It catches up at most 200 device/job entries per run.
2. Deduplicates device/job pairs, claims at most ten due deliveries with ten-minute leases, and checks the current user/binding/lease/job again immediately before sending.
3. Sends only the fixed generic message to Expo's fixed HTTPS origin, with a server-only access token, no redirects and bounded timeout/response size. Message TTL is one hour. Collapse/tag identifiers reduce repeated notification clutter.
4. Records Expo tickets separately from APNs/FCM receipt acceptance. Receipt checks start after 15 minutes. Neither state is labelled “seen by customer.”
5. Uses durable exponential backoff, at most five send attempts and twelve receipt checks. A provider-declared rate rejection can requeue a bounded send; a receipt lookup outage retries only the lookup. Invalid tokens disable only the exact matching binding. Credential/payload failures are retained for review, not retried forever.

Delivery is best effort, not exactly once. A crash or timeout after Expo accepted a message but before its ticket was persisted can cause a duplicate retry. No provider offers a transaction shared with this database. An already in-flight notification can also arrive after logout/disable; generic content limits exposure. Push failure never changes credits or job success.

Current capacity is deliberately conservative: ten delivery/receipt operations per cron run. Load-test against the expected staging volume before raising batch size or introducing a dedicated push queue. Expired/disabled recipients are cancelled, outbox history older than 30 days is removed, and expired registrations lose their user/token data. Minimal installation revision/hash tombstones remain to reject late requests. Shared-account deletion must include this lifecycle.

## Configuration and release gates

Do not enable production from this document alone.

1. Apply all approved additive migrations to **isolated staging**, not the live database; verify full-schema compatibility and the terminal-job query plan at realistic volume.
2. Configure a dedicated staging EAS project, `EXPO_PUBLIC_EAS_PROJECT_ID` in the staging build, and matching Worker `EXPO_PROJECT_ID` plus private settings `environment/eas_project_id`.
3. Configure APNs signing/push credentials for iOS and FCM v1 for Android through the owner's accounts. Do not share or revoke keys used by other apps.
4. Enable Expo enhanced push security; store its credential only as Worker secret `EXPO_ACCESS_TOKEN`. Keep it out of app `EXPO_PUBLIC_*` values and logs.
5. Preserve existing service/database configuration; set the Worker `MOBILE_NOTIFICATIONS_ENABLED` and database setting `enabled` only after staging review. Both default false. Customer entry must also be enabled for registration.
6. Deploy only the additive mobile Worker; test its cron, receipt polling, token rotation, account switching, offline sign-out, registration ordering, reinstall, revocation, permission denial, suspended accounts, TTL and delivery saturation on real iOS/Android devices.
7. Add operational alerts for redacted `dispatch_unavailable`/error counts and retained failed outbox records. A full Admin delivery-monitor screen is not yet included. Verify cleanup and provider credentials before public release.
8. Approve Expo/APNs/FCM data handling in privacy disclosures. This is transactional photo status only—no advertising, marketing or new analytics tracking.

To stop new notification delivery, disable the Worker notification flag; also disable the database setting. Keep the installation-disable endpoint and credentials available. Do not alter imaging Workers, processing queues, financial records or reverse migrations as routine rollback.

## Verification performed

- Mobile/Worker type checks and frozen customer API contracts passed.
- 270 unit tests across 20 files passed; new cases cover opt-in, changed accounts, offline cleanup, monotonic revisions, rejected deep links, response bounds, fixed provider destination, receipt/error mapping and redacted diagnostics.
- Eleven-migration synthetic Postgres suite passed, including real existing Stripe functions, delivery dedupe/leases, stale disable/enable, prior-token receipt isolation, sender retry caps, suspended customer recheck, expiry cleanup, least privileges and no job trigger.
- Worker dry-run passed (606.89 KiB, 93.72 KiB gzip); no deployment.
- iOS simulator Release build and embedded configuration check passed: `output/ios-simulator-2026-09-09T08-04-31.462Z.log`. The updated binary was installed/launched on the dedicated Furnio Mobile QA simulator; its welcome screen was visually checked (`output/notification-build-smoke.png`). Demo mode does not send real push and is not device-delivery evidence.

Official behaviour checked: [Expo push delivery, tickets, receipts, errors and enhanced security](https://docs.expo.dev/push-notifications/sending-notifications/), [Expo notification permissions/listeners](https://docs.expo.dev/versions/latest/sdk/notifications/), [Cloudflare Workers practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/). Recheck these at release.
