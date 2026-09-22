# Apple 2.1 response preparation — 12 September 2026

**Final status — 13 September, 02:47 EDT:** Response posted with the launch video, full-flow video saved in App Review Information, all six Notes answers updated, and build 1.0.0 (4) resubmitted. Apple confirms Waiting for Review for submission `8a38cd31-4379-4972-ad62-41c24a07b245`. This supersedes historical pending/draft text below. No further recording has been requested from the owner. Approval/public release remain Apple's separate next steps.

Status on 13 September: Build 4 is processed by Apple and selected/saved for review. Owner supplied `~/Downloads/ScreenRecording_09-13-2026 02-27-10_1.MP4` (213.120 seconds, 354,491,396 bytes). Sampled frames verify registration, SMS, project/map, real kitchen staging, before/after, preview saving, sign-out/sign-in and deletion-request receipt.

Supplement received: `~/Downloads/ScreenRecording_09-13-2026 02-42-37_1.MP4` (59.305 seconds, 110,754,456 bytes). Inspected sampled frames verify Home Screen launch, email/password reviewer login, 50-credit dashboard, service catalogue and account/settings. Byte-identical lowercase-extension copy: `output/apple-review-2026-09-13/Furnio-iPhone17ProMax-build4-launch.mp4`, SHA-256 `f26781ddf8c5a16e089008080230b2d3801bd4ca3014301340b08b0353e4f1db`. Both originals remain unchanged. This supplement complements, not replaces, the full-flow video. Current reply is updated to identify both recordings; posting and final submission are recorded separately in `STORE_SUBMISSION_STATUS.md`.

Minor existing UI issue observed in the second recording: `app/(tabs)/account.tsx` has a hard-coded “Development build 0.1.0” footer. It is not the actual installed/signed build version, which was verified as 1.0.0 (4). No code or build was changed during this attachment/submission task. Track this wording for a subsequent release; do not misidentify the binary from the footer.

Owner explicitly requested using the original video despite visible personal gallery thumbnails, other Google accounts and SMS details. Original is unchanged. A byte-identical lowercase-extension copy is `output/apple-review-2026-09-13/Furnio-iPhone17ProMax-build4-full-flow.mp4`, SHA-256 `85fa85c486b0cc76b658800dc2b78fadd43faf41ddd3f0098313da257f36bd9c`. Apple rejected the uppercase `.MP4` extension; the lowercase copy uploaded, finished processing and is saved in App Review Information. No resubmission or posted reply is claimed yet.

The reviewer account remains `app-review@furnio.ai`, verified read-only with 50 credits and `phone_verification_required=false`. Owner may use it for the supplementary launch/dashboard clip but must not delete it. Existing personal Gmail accounts checked did not have active verified-phone claims; do not call them phone-verified based on a credit balance alone.

The historical draft below must be updated to build 4 and the received recording before sending. Six factual answers (3,592 characters) are saved in App Review Notes; posting the reply and attaching the supplemental launch clip remain pending. The full recording attachment is verified saved.

Apple submission: 8a38cd31-4379-4972-ad62-41c24a07b245, version 1.0.0 (2). App Store Connect confirms Rejected / 2.1.0 Performance: App Completeness and the six-item information request.

## Response text to finalize after device QA

1. Physical-device demonstration: [Attach recording and state actual device, OS version, app version/build and test date after verification.] The recording starts with launching Furnio and demonstrates registration, login, project creation, photo selection, service controls, confirmed processing, a completed result, saving/sharing, credit balance and account-deletion request. Use a separate disposable account for deletion, preserving the reviewer account.

2. Purpose and audience: Furnio is a real-estate photo editing and project-management service for real-estate photographers, agents, property marketers and other customers preparing property imagery. It helps customers stage empty rooms, remove selected items, adjust exterior presentation, create twilight images and manage the resulting images in property projects. It is available to individual customers and is not restricted to employees of a particular organization. AI outputs must be reviewed before use.

3. Access and main features: Use the dedicated customer login supplied in App Review Information. The reviewer account is app-review@furnio.ai; its password is in Apple's private password field, not this document. It was provisioned with 50 credits and a phone-verification exemption; recheck access and balance before sending. From Home choose a service, create/select a property project, select a photo, choose the service-specific options, review the credit cost and AI disclosure, then submit. Open the project to follow processing and view, compare, save or share the result. Existing website purchases supply the shared account credit balance. There are no iOS in-app purchases or in-app checkout. Account privacy/deletion is available in the app and requires recent authentication plus explicit confirmation. Accepted requests are currently handled asynchronously; do not describe them as immediate automatic deletion. [Attach licensed sample inputs after selecting the final files.]

4. Core external services: Supabase provides account authentication and database services; Google and Apple provide optional federated sign-in; Twilio provides phone verification; Cloudflare provides API/processing Workers, media storage and Turnstile security checks; FAL provides AI image processing; Mapbox provides property-address search and map previews; Stripe processes website subscriptions and credit-pack purchases. RevenueCat and Apple/Google in-app purchase processing are not active in this release. Verify any additional provider selected for the enabled production services before sending this list.

5. Regions: The requested launch storefronts are Canada and the United States. The iOS editing workflows are intended to work consistently in both. Availability of services, complimentary previews and credits follows account eligibility and current service settings, not a separate regional catalogue. There is no iOS storefront-specific purchase link in this build.

6. Rights and regulated activity: Furnio provides image-editing software; it does not provide regulated financial or medical services. Customers must have rights to their uploaded images. Furnio's Terms, Acceptable Use Policy and AI Disclosure apply. Any specific third-party asset license requested by Apple should be supplied from the actual license records; do not invent licenses or certifications. Floor-plan/AI outputs must not be represented as certified survey or architectural documents.

Private uploads are visible to the owning account. There is no public feed, public user profile, chat or user-to-user publishing inside the app. Explain that distinction when addressing Apple's conditional reporting/blocking request; do not claim reporting or blocking tools exist if they do not.

## Physical-device recording sequence

1. Confirm the installed build number and current iOS version. Start the recording at the Home Screen; launch Furnio.
2. Register a disposable QA account, complete the actual verification requirements, then sign out and sign in again.
3. Show trial availability and restrictions if the promotion is active.
4. Sign in to the separate funded QA/reviewer account, create a property project, use address lookup/map and select a licensed sample image.
5. Choose service options and show the real credit cost and processing confirmation. Wait for the actual job and open the result; compare and download/share.
6. Show the shared balance and account screens. Exercise background/foreground and repeated navigation during QA before recording acceptance.
7. Use the disposable account to demonstrate reauthentication, deletion review, confirmation and receipt. Complete its actual asynchronous deletion and verify access removal; preserve required payment records for seven years.
8. Review the video for private notifications, real customer media, passwords and verification codes before sharing it with Apple.

## Current diagnostic limitation

On 12 September the owner connected and unlocked the paired iPhone 17 Pro Max by cable. Device information confirms iOS 27.0 (24A435), wired, paired and Developer Mode enabled. The upload-modal repair was installed earlier and the owner reported no further freezes. Build-3 acceptance and the required recording are still pending.
