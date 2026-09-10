# Account privacy — request abuse protection

Updated 9 September 2026, 15:21 Toronto. **Local implementation and mock-boundary tests passed; not deployed or validated at Cloudflare's real edge. Final account deletion remains code-blocked and all rollout flags remain false.** No new migration, visitor table, production secret, live account operation or network setting was added.

## Implemented

The dedicated Mobile Worker now protects privacy review, prepare, cancel and receipt status before database access. The unavailable confirm endpoint still rejects immediately; the new limiter cannot enable deletion.

| Boundary | Staging binding setting | Identity used |
| --- | --- | --- |
| Before body/Auth/database work | 120 requests per 60 seconds | Cloudflare-provided source address, normalized IPv4/IPv6 |
| After fresh Auth verification, before review/prepare/cancel SQL | 10 requests per 60 seconds | Verified Furnio account UUID |
| Before capability-only status SQL | 12 requests per 60 seconds | Complete validated request UUID + receipt secret |

The source limit is deliberately coarser than the individual controls to reduce shared-network disruption. It is not sufficient against distributed abuse and may still affect many legitimate customers behind a shared mobile carrier or proxy. Tune against staging/production telemetry and test shared-network recovery before release.

All counter keys are HMAC-SHA256 under an independent server-only key with application/environment/purpose separation. No raw address, account UUID, receipt UUID or receipt secret is sent as a limiter key or written by the application's request logger. No IP/visitor database records are created. These keys are **pseudonymous**, not a promise of anonymity or a replacement for a retention/privacy policy. Provider network/log retention must be configured separately.

Only `CF-Connecting-IP` is used; missing/invalid input fails closed. `X-Forwarded-For`, `X-Real-IP`, body selectors and unverified JWT subjects are not trusted. The deployment must use a verified direct Cloudflare ingress; do not place an unreviewed Worker/proxy in front of this endpoint that can substitute headers. This staging configuration has no public route yet.

The receipt counter includes the secret so someone who knows only a request UUID cannot exhaust the genuine holder's counter. UUID case and equivalent IP forms cannot split the same counter. Source addresses can still change; rate limiting never replaces the cryptographically random capability or database authorization.

Cloudflare's binding is intentionally approximate, eventually consistent and local to a Cloudflare location—not a globally exact limit. Existing SQL authorization, idempotency and the exact preparation quota remain authoritative. These limitations are documented in the official [Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Failures and rollback

- Denied requests return HTTP 429, `Retry-After: 60`, `Cache-Control: no-store` and a fixed safe message. The header is a conservative wait, not an exact counter-reset timestamp.
- Missing configuration, rejected/invalid limiter results or a limiter call lasting more than one second fail with a redacted 503 before database work. A late limiter result cannot resume the request. The binding itself has no cancellation API.
- Review/request capability flags also require limiter configuration; flags alone cannot advertise availability. Actual limiter health still requires a request and monitoring.
- Receipt status remains independent of login and app/request-entry flags. Keep its bindings and secret configured during rollback; otherwise it safely becomes unavailable rather than exposing unprotected reads. Rotating this HMAC key resets limiter counters, **not** database receipt hashes or receipt validity; do not rotate routinely as a bypass.
- The native transport now explains 429 with a one-minute wait. A 503 no longer claims the account was not deleted: it tells the customer to retain the receipt and check status later. Neither response automatically retries or replaces the saved receipt.
- Ordinary website login, SMS, customer processing, Stripe/RevenueCat reconciliation and notifications do not call these limiters.

## Setup before isolated staging acceptance

1. Review the three locally reserved staging namespace IDs in `backend/wrangler.jsonc` for uniqueness across the intended Cloudflare account. They have not been registered/deployed by this change. Production needs distinct namespaces.
2. Generate a new independent random 32-byte secret, represented as exactly 64 lowercase hexadecimal characters, and store it as the Mobile Worker's `ACCOUNT_DELETION_LIMIT_SECRET`. Use secure secret entry; never paste the value into chat, source control, the native app or a command-line argument. `.dev.vars.example` contains only an empty placeholder. Do not reuse Stripe, RevenueCat or Supabase keys.
3. Retain the existing disabled flags and hard-coded final-deletion gate. Completing rate-limit setup does not make account deletion ready.
4. In isolated staging only, verify real bindings/ingress headers, 429 behaviour and recovery after a minute, shared-network customers, IPv4/IPv6, account switching, post-sign-out receipts and configuration failure. Counters are not globally exact; real multi-location abuse/WAF review remains open.
5. Verify native dialogs and receipt recovery on iOS/Android with actual staged responses. The simulator's currently installed demo predates this wording-only native change; no new native build was required for Worker tests, and these messages are **not visually accepted yet**.

## Verification

- Mobile/backend suite: **968 tests across 55 files passed**. New tests cover key scoping, normalization, source spoofing rejection, missing bindings/secret/environment, all denial stages, malformed/error/timeout responses and retained receipts without mutation retries.
- Mobile TypeScript, frozen customer API contracts, Worker TypeScript, local Wrangler dry-run and whitespace checks passed. Generated Env types reflect the real bindings. No dependency upgrade was needed; installed Workers types `5.20260908.1` matched the current package version checked during this work.
- Source inventory still covers 123 table declarations; no migration hashes changed for this milestone.
- The earlier owner-authorized isolated SQL run passed all 22 pending mobile migrations, including the email claim race and subscription overlaps. This milestone changes no SQL and did not rerun that suite. Its temporary containers are gone; the separate question about quitting Docker and its automatically resumed pre-existing LiveBy-Rep stack is still awaiting an answer.

Remaining deletion work is recorded in `ACCOUNT_DELETION.md`: full identity/provider/session revocation, personal-data cleanup, in-flight communications, approved retention/receipt expiry, operational completion and real staging/physical-device acceptance. Do not treat this abuse-protection milestone as release approval.
