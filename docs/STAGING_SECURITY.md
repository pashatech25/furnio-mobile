# Staging authentication security — 9 September 2026

## Isolation

- Database: `bcrobmrimzkvfrnqarmv` only. Production Auth (`sgsjkgfwgxmlqcgyuyeh`) is read only for matching provider configuration and before/after verification.
- New widget: `0x4AAAAAAEue1jhZKP6PJAEE`, managed/no clearance. Domains: `furnio-mobile-staging.amidi-alipasha.workers.dev`, `localhost`, `127.0.0.1`. Existing Furnio/RealViu website widgets were not edited.
- Customer backend accepts only the exact hosted staging challenge hostname, **not localhost or production**. It reuses existing `trial-phone` Siteverify, authenticated phone reservation, rate-limit, OTP and phone-claim handlers.
- Signup, password sign-in and reset pass their fresh tokens to staging Supabase's built-in CAPTCHA verifier. Do not describe Supabase's built-in verifier as having our custom action/hostname checks; the explicit checks belong to the customer phone handler.
- No production routes, processing queues/media bindings, provider generation keys or paid routes were enabled.

## Credential destinations

- `.env.staging-turnstile.local`: git-ignored, mode 0600, sitekey and widget secret; never load into Expo.
- Customer staging Worker: `TURNSTILE_SECRET_KEY` and a new random `PHONE_HASH_PEPPER`, added using the approved external Wrangler 4.129.0 and standard stdin secret writes after exact-target secret-list checks.
- Staging Supabase Auth: widget secret and existing verified Twilio Verify Auth Token. No raw Twilio token saved locally; clipboard cleared after successful transfer.
- The website currently uses Twilio account `[configured locally]` (console name RealViu) and service `VA0b419be90e12bd476afb6df4227f34f9`. Staging matches these; no service settings or credentials were rotated. SMS is real and incurs normal provider usage; it is not a simulated delivery.

## Deployed versions

| Worker | Version |
| --- | --- |
| furnio-api-mobile-staging | `52c56c37-b8b3-4413-8d80-8ed9501ba1ef` |
| furnio-mobile-staging | `dd889bd7-768d-43c1-acb5-dcdeab18a315` |

Both dry runs/deployments passed. The older `deploy-staging-readonly.mjs` intentionally rejects the expanded secret list: it must not be used unchanged for this new milestone. These deployments used the reviewed explicit staging configs, approved canonical Wrangler and `/dev/null` env-file; existing server secrets were preserved.

## Observed acceptance

- Widget metadata/expected domains and real-secret invalid-token validation: passed.
- Installed native Release (`output/ios-simulator-2026-09-10T01-42-54.772Z.log`): screenshot visibly shows **Success!**.
- Actual native phone-start request: passed through the existing protected customer endpoint and initiated one real SMS; app displays the code-entry screen and resend countdown.
- Unauthenticated phone-start: 401; unsupported challenge action: 400; paid checkout still closed: 503.
- Local regressions: 11 native auth/navigation tests, 36 customer gate/trial tests, 22 support endpoint tests; native typecheck and Release build passed.

## Still pending

- Owner-entered real OTP and dashboard/phone-claim result.
- Fresh-token replay rejection against a real protected remote request (covered in local verifier tests, not yet claimed as remote acceptance).
- Actual email signup/confirmation/reset and Apple login.
- Android and physical iPhone verification acceptance.
- Trial grants, image generation, native maps and other remaining app release gates. This security fix is not an app-completion claim.

## Code-entry UX correction

Owner received the SMS but could not see the code field: the initial implementation appended it beneath the large phone form. Corrected to replace the phone form with a dedicated **Enter your code** step and reset the scroll position; resend/change-number are secondary controls. On restart, a pending change can be restored from the authenticated owner's server-reported `new_phone`, without persisting a code or claiming the phone is verified. A manual edit takes precedence over the asynchronous restoration. Physical/narrow-screen acceptance and the owner's completed OTP are still required.

Read the web implementation (`apps/web/src/components/trial-onboarding-dialog.tsx`) and matched its mutually exclusive phone/code steps. Corrected Release `output/ios-simulator-2026-09-10T01-54-03.373Z.log` installed; actual simulator AX/screenshot `output/staging-code-step-corrected.png` confirms the code-only step restored for the existing pending phone. No additional SMS was sent during reinstall. Thirteen focused native tests, TypeScript and Release build pass.
