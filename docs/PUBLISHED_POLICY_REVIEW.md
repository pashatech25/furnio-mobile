# Furnio Mobile — published-policy review

Reviewed 9 September 2026 at 16:01 Toronto (20:01 UTC). The owner supplied these five public URLs in response to the payment-record and backup-retention question. All five returned HTTP 200 and their readable page content was reviewed. Each displayed an update date of 31 August 2026.

**Status: reference material received, not a complete retention schedule or approval to enable deletion.** This is an implementation review, not a legal opinion. No published policy, production setting, database record, customer account or billing behaviour was changed. Permanent deletion remains disabled.

## What the published pages establish

| Source | Relevant published commitments | Effect on the mobile implementation |
| --- | --- | --- |
| [Terms of Service](https://furnio.ai/terms), sections 3 and 6 | Images are designed for 30-day retention; property archive removes stored images and retrieval links. Customers must keep their own downloads. Subscription credit rollover and cancellation are described. | Preserve the existing website rules. Do not treat image retention as a payment-record or backup-retention period. Add explicit native-purchase distinctions before launch. |
| [Privacy Policy](https://furnio.ai/privacy), sections 1, 3, 4 and 7 | Describes the data and processors used, intended 30-day image retention, deletion requests with identity checks and lawful exceptions, and limited verification/audit retention for stated purposes. | Use minimal retained records with a documented purpose. It supplies no fixed financial, backup, security-log or post-deletion audit expiry. Listed payment processing is Stripe; native processors and new mobile data need review. |
| [Refund and Cancellation Policy](https://furnio.ai/refund-policy), sections 1 and 3–7 | Describes billing-period cancellation, unused-pack and initial-subscription review within seven days, accidental-renewal review within 48 hours, and restoration of credits after technical failure. | Preserve website behaviour. Refund-request windows are not data-retention periods. Distinguish store refund/subscription management and verified store events before native sales open. |
| [AI Imagery and Disclosure](https://furnio.ai/ai-disclosure) | Explains disclosure controls, customer review and keeping original photographs, with service-specific limitations. | Preserve equivalent mobile disclosure controls and accurate original/result pairing. A customer's obligation to keep an original does not require Furnio to retain it indefinitely. |
| [Acceptable Use Policy](https://furnio.ai/acceptable-use), sections 4 and 5 | Prohibits evasion of service controls and allows proportionate enforcement and preservation of evidence. | Do not erase evidence under an applicable documented hold, or reinterpret that provision as unlimited retention of every account's data. |

These summaries identify product commitments; they do not verify that every deployed storage rule or third-party processor currently fulfils them.

## Retention decisions still required

Do not fill missing values with 30 days, the refund-request windows, a made-up tax period or “forever.” Record the following in a reviewed operational schedule:

| Data class | What still needs to be established | Implementation requirement |
| --- | --- | --- |
| Payment, subscription, refund and dispute records | Required retention period, start event, jurisdiction/entity and permitted exceptions, confirmed with the owner's accountant or legal adviser. | Keep only necessary transaction/provider linkage and audit fields. Separate these from photos, property addresses, prompts and marketing profiles. |
| Database backups and other recovery copies | Actual provider settings, longest recovery window, location, access restrictions and any separate snapshots/exports. | Remove active data through the deletion workflow; let verified backup expiry operate and reapply deletion tombstones before a restored system resumes service. Do not promise immediate removal from every backup. |
| Fraud/trial claims, security events and legal holds | Purpose-specific period or review rule, minimum fields, hold authorisation and release process. | Pseudonymous phone/IP claims can still be personal data; hashing alone does not justify indefinite retention. Holds must not silently retain unrelated content. |
| Support, email, automation and deletion receipts | Expiry/review rules for payloads and minimal operational evidence. | Suppressing future sends is not erasure. Preserve only the receipt needed for recovery/accountability, not unnecessary raw messages or provider responses. |
| AI processors, CDN/device caches and exported files | Provider-specific deletion/expiry controls and an accurate description of copies outside Furnio's control. | Verify cleanup independently; customer exports to Photos or other apps are not remotely erasable by Furnio. |

The first two rows are the direct answer to the original question. The remaining rows are adjacent release requirements, not new retention periods approved by the owner.

## Mobile wording to prepare for owner review — not published

1. **Payment providers and management:** distinguish Stripe website purchases from Apple App Store and Google Play purchases, and explain RevenueCat's role and the data shared with it. Present the actual storefront price/currency. Do not rewrite existing Stripe billing or tax settings.
2. **Credits:** clearly separate the approved non-expiring native-purchased credits, including native monthly grants, from existing website subscription/rollover rules. Account deletion still removes access to remaining credits; cancellation must not silently erase previously purchased native credits.
3. **Refunds and cancellation:** give provider-specific management and refund routes. Explain that account deletion is different from cancelling store renewal; do not promise a website refund workflow can directly issue an App Store refund.
4. **Mobile privacy:** review Apple sign-in, push/device tokens, permission-dependent photo access, secure local drafts and diagnostic handling against what actually ships. No new advertising tracking is approved.
5. **Deletion transparency:** explain loss of the shared website/app account, the stages of cleanup, necessary retained records and verified backup limitations. Do not claim that a queued request is complete or supply an unapproved completion deadline.

These are acceptance criteria for a later policy draft, not replacement legal text. Owner review and applicable professional review are required before publication/store submission.

## Limited source check

The existing website API's `apps/api/src/lib/retention.ts` deletes the recorded master/preview/thumbnail R2 keys for expired assets before marking them purged. Two source paths in `apps/api/src/lib/supabase-rest.ts` assign a 30-day asset expiry. This supports the intended image-retention design, **not** certification of all assets, bucket lifecycle settings, backups or production scheduling. No live provider configuration was inspected or changed in this check.

## Account identity work: keep the next step separate

The supported Supabase Auth soft-delete operation was researched before this policy reply. It can retain the user UUID used by financial foreign keys while retiring credentials and sessions, but it is not whole-account erasure or immediate invalidation of all issued JWTs. Provider revocation, permanent access fencing, retained-data treatment and independent completion checks remain necessary. See [Supabase admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser) and [sessions guidance](https://supabase.com/docs/guides/auth/sessions).

No new identity-retirement SQL or Auth request was implemented or run in this checkpoint. The empty, never-applied migration placeholder `20260909195513_mobile_account_identity_retirement.sql` was removed so it cannot be mistaken for a tested migration. The existing **23** mobile migrations and their reviewed hashes remain the last completed database checkpoint. Future work must use a newly created migration, not claim a 24th migration passed.

Continue independent disabled implementation and local verification while the schedule is resolved. Do not enable irreversible deletion, change the final processor-ready gate, or treat receipt of these URLs as approval of missing retention values.

## Reproducible source identity

SHA-256 of each fetched page's exact `<main>` inner HTML, captured at the review time. These identify the reviewed content, not a legal approval or evidence of provider configuration. The complete public pages remain at the linked URLs; no customer data was fetched.

| Page | SHA-256 |
| --- | --- |
| Terms | `3517f0e40957ba6d80720b568cd7149a6384512fbbe8d4ae07901dcd58089545` |
| Privacy | `44f82ab85d9f09300311588c7b51d3fab31681941a5deaa8dfd6929fee737c99` |
| Refunds | `3cdc0c718874216c9cc5fc0a6c7e8f3e905b9d9b855560489df78dfd006ad9fc` |
| AI disclosure | `c9a795ff24e13556c8908d6688beae3f600d2389a46fda6384aefbcf77bdba9f` |
| Acceptable use | `03f4042bb53b400cb5b2d27c489d885826c6879241b7fb913bb27d8fe1097ff4` |
