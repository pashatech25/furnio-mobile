# Store reviewer account — September 10, 2026

- Owner authorized a separate reviewer customer, $50 credit value and account-specific phone exemption.
- Production account: `app-review@furnio.ai`. Password is only in the ignored, mode-0600 `output/store-review-account.json` and Apple's private reviewer fields; never commit it.
- Current production `50 Credit Pack` costs USD 50 and grants 50 credits. Granted exactly 50 once through existing `admin_adjust_credits`, with idempotency key and owner-authorized metadata. No Stripe payment or subscription was fabricated.
- Existing profile-level `phone_verification_required=false` exemption used. No fake phone number or SMS verification claim, no shared Auth/OTP policy change. Other customer records untouched.
- Verified `/api/me` returns 200 and `/api/trial` returns 200 with `phoneRequired=false` using a server-issued reviewer session. Test session signed out. Interactive password login remains CAPTCHA-protected and was not certified by this API test.
- Re-running provisioning verified balance remains 50, rather than duplicating the grant.
- Apple private reviewer notes and credentials saved. Google private access fields still need these credentials.
- Apple build 1.0.0 (1) finished processing and shows Ready to Submit. This is not an App Review submission or public release.
- Owner also confirmed no separately downloaded customer backups; payment records retained seven years. Infrastructure-managed backups remain a separate retention consideration.

Account setup followed the Supabase skill's server-only credential and verification guidance. Release work, including permanent account deletion, privacy/age questionnaires and Google testing, is not certified complete by this account setup.
