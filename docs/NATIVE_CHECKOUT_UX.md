# Native checkout recovery UX

Updated 9 September 2026. Implemented and tested locally. **Not store-certified or deployed.** Acquisition remains disabled. A subsequent disabled backend milestone now implements explicit SDK cancellation checks; see `NATIVE_CANCELLATION_RECOVERY.md`.

## Customer-facing behaviour

Credits & plans reads the current account's encrypted device journal. A saved checkout has a persistent card, an opaque selectable support reference, Check purchase recovery, Restore purchases and Contact Furnio support. Opening this card does not contact the store or start a payment. Existing credits remain usable. New purchase buttons stay disabled while a saved checkout or unreadable recovery journal exists.

The app distinguishes these SDK purchase outcomes using the installed RevenueCat error-code enum:

| Device observation | Customer explanation | Financial effect |
| --- | --- | --- |
| Purchase cancelled | Store reported cancellation; server checks recovery/ownership | No credit change; selection can clear only after the new server checks |
| Payment pending | Follow store approval/payment instructions; check later | No grant until independent verification |
| Product already owned | Restore under the correct Furnio account | No new purchase or account merge |
| Network/store/unknown error or interrupted launch | Outcome unconfirmed; check or restore | Keep the original checkout protected |

These are **device observations**, not verified server states. Message text and the deprecated `userCancelled` boolean alone do not classify an error. Raw errors, receipts, payment tokens and store response JSON are neither persisted nor sent as recovery evidence. An optional enum is saved only for a launched checkout without a reported transaction; existing journals without this enum remain readable.

Check purchase recovery first reads the exact owned intent. When it is unresolved, this explicit action requests the existing bounded/idempotent account-history reconciliation, then re-reads that intent. It does not open a store sheet, charge, or retry generation. An exact verified delivery takes priority over an earlier cancellation observation. A support-review result takes priority over an ordinary pending message.

Restore also checks the saved exact intent after starting history reconciliation. A successful history scan cannot be presented as that checkout's successful payment. Merely waiting for a callback is described as pending, not as proof that a queue is currently running.

Account changes remount the wallet, clear old local UI and suppress completion dialogs from unmounted operations. Commerce rechecks account identity across asynchronous gates. A synchronous UI lock prevents two rapid taps before React commits its busy state. The app validates the returned launch intent ID/status before opening the store.

## Cancellation follow-up

Ordinary SDK cancellation now requests a separately gated owned server check. The server can release the selection after fresh RevenueCat checks and a final locked database recheck; it never treats the client report as payment evidence. See `NATIVE_CANCELLATION_RECOVERY.md` for the audit, limitations, late-payment visibility and tests. Pending/unknown launches and conflicting hints still need resolution. Actual-store certification remains a release gate; do not enable acquisition yet.

App termination, ambiguous errors, pending approval, and a cancelled store sheet are not interchangeable. Actual Apple/Google sandbox tests, including the iOS already-owned cancellation case, must establish the final safe release policy. Neither clearing the journal nor deleting the server reservation manually is the production solution.

## Original UX milestone verification (before the backend follow-up)

- Mobile TypeScript, frozen API contracts and **552 unit tests across 34 files** passed, including 37 added cases for SDK classification, durable observations, failed storage, mismatched launch permits, account switching, exact restore status, redacted errors and recovery notices.
- Worker TypeScript and a fresh unsigned iOS simulator Release build/configuration check passed. The newest binary was not installed/exercised; actual store UI still needs signed device/sandbox acceptance.
- Offline visual QA used the actual Wallet and native UI components through React Native Web with compile-time sample adapters. Checked phone cancellation/check/restore and tablet pending-approval presentation; measured document/viewport widths 390/390 and 768/768. Inspected screenshots, with zero errors/warnings in the checked session. This is not physical-device, accessibility or actual-store certification.
- `node scripts/preview-mobile-wallet.mjs` recreates the offline fixture under ignored `output/playwright/mobile-wallet`. It never loads Auth, the live API or the store SDK. Its Restore action simulates verification; that simulation is not a payment test.
- No Worker, database migration, Stripe route, web/Admin source, production flag or imaging prompt changed in this milestone. The eighteen existing additive mobile migrations remain unapplied.

Sources consulted: RevenueCat documents cancelled, already-owned and pending-payment behaviour separately in [Error Handling](https://www.revenuecat.com/docs/test-and-launch/errors). The installed React Native SDK defines its current error enum and deprecates the legacy cancellation helper. These sources inform UX classification only; they are not transaction evidence.
