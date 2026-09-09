# Furnio Mobile

Independent React Native / Expo customer application for iOS and Android. This is **not** a WebView wrapper. The web target is only a convenient design/testing preview of the same native components.

## Safe start

Use Node 22.13+ and the pinned pnpm 11.19.0. Run `pnpm install --frozen-lockfile`, then `pnpm export:preview && pnpm preview`.

The compiled design preview is at `http://127.0.0.1:4340/`. Choose **Explore the sample app**. It serves only the exported native-components bundle, with no external backend. Re-export after editing. Native development uses `pnpm start --scheme furnio`.

`pnpm web --host localhost` remains available for Metro development, but the installed Expo/Metro combination exhibited an HMR registration crash at the root URL during this session. Use the compiled preview above for review until that development-tool issue is resolved. This is not a native-device test result.

Without environment configuration the app runs in a clearly labelled offline demo. It never signs in, sends SMS, buys anything or starts a provider job. Demo balances, jobs and projects are samples.

For real authentication and native purchases use an Expo development build, not Expo Go. Copy `.env.example` to a local ignored `.env` and use approved staging services only. Follow `docs/RELEASE_GATES.md` before production configuration.

## Verification

- `pnpm check` — TypeScript, unit tests and frozen API contract integrity.
- `pnpm test:ledger` — disposable, network-isolated synthetic Postgres tests, including original Stripe allocation/rollover compatibility. Does not touch other local databases.
- `pnpm export:preview` — bundle the native-components web preview.
- `pnpm exec expo export --platform ios --platform android --output-dir native-bundles` — JavaScript/Hermes bundles, not installable app binaries.
- `pnpm worker:types`, `pnpm worker:check`, `pnpm worker:build` — local Worker validation, no deployment. Generate Worker types before its first typecheck.
- `pnpm exec expo install --check` — check Expo dependency compatibility.

Do not deploy `backend/` yet. Signed purchase verification, durable history recovery, purchase-intent/ledger linkage, cross-provider checkout locks, billing/activity reads and initial web/Admin compatibility are implemented locally. Unstarted selection recovery and audited Admin linking to verified payments are included (`docs/NATIVE_CHECKOUT_SUPPORT.md`). Device registration and independent push delivery remain disabled/unconfigured (`docs/NOTIFICATIONS.md`). Account privacy now has native review/confirmation UI, isolated same-account reauthentication, device-only receipt recovery, permanent-fence/bounded-media-cleanup stages and a verified Auth sign-in block checkpoint. A sign-in ban is not session revocation or deletion. Full identity/provider/personal-data cleanup, retention and real staging/device acceptance are still unfinished (`docs/ACCOUNT_DELETION.md`). All deletion flags remain disabled; the sample outcome does not submit a real deletion. Staging, real-store acceptance, cancelled/unknown checkout resolution and other release gates remain incomplete. Acquisition stays disabled. See `docs/NATIVE_BACKEND.md`, `docs/NATIVE_PURCHASE_INTENTS.md`, `docs/NATIVE_RECOVERY.md` and `docs/PROGRESS.md` before configuring callbacks or flags.

## Isolation

This directory has its own Git repository, dependencies and lockfile. No remote is assumed. The main website, its lockfile, production data, deployments, billing and authentication settings are not changed by installing or starting this app.

See `docs/IMPLEMENTATION_PLAN.md` for the approved scope and `docs/PROGRESS.md` for verified delivery status. A visible screen does not imply its production integration has been accepted.
