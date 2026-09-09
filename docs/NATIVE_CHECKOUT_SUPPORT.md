# Native checkout recovery and Admin support

Implemented locally on 9 September 2026. **Not deployed, enabled or store-certified.** This does not change the existing Stripe payment pipeline, prices, tax, coupons, or imaging services.

## Customer: a selection never reached the store

The app persists a request ID before asking for eligibility. If connectivity fails before the response, **Check purchase recovery** now looks up that original request ID using the authenticated account, configured environment and device's store.

- An existing, unlaunched reservation is atomically cancelled.
- A concurrently launched checkout stays pending; recovery cannot unlock it.
- A missing selection is reported explicitly rather than mistaken for a paid transaction.
- The app clears only its unstarted selection after a successful server result. Network errors retain recovery data.
- This route remains available during acquisition rollback. It cannot cancel a Stripe session.
- A delayed eligibility request may create an unlaunched reservation after an absent lookup; that reservation cannot itself charge and expires after ten minutes. The UI explains this possible temporary delay. There is no claim of ordering across separate network requests.

`POST /v1/purchases/recover-selection` accepts only `{store, requestId}`; customer UUID and environment are server-derived. It returns `{intentId,status}` or `{intentId:null,status:"not_found"}`. A client-provided price, credit quantity, account ID or environment is rejected.

## Admin: a verified payment lost its checkout link

After the future rollout is enabled, open **Customers → customer details → Native billing → Interrupted checkouts**.

1. Select **Refresh checkouts**. Up to 20 launched checkouts appear, including recently started ones.
2. For Apple/Google, the server lists up to ten independently verified candidate payments matching this account, environment, store, immutable product and launch timestamp. They must have a delivered credit lot and cannot already belong to another checkout.
3. An **owner, admin or finance** user selects the matching payment and enters an audit reason (10–500 characters). No selection is prefilled.
4. **Review payment link** opens an inline confirmation. **Back** makes no change; **Confirm verified link** submits the action.
5. A database transaction rechecks the administrator's current active role, customer ownership and payment evidence under the per-account purchase lock. The link and its immutable audit record commit together. Retries are idempotent.
6. Ask the customer to select **Check purchase recovery**. The app now observes the specific verified transaction and clears its pending journal.

This action **never grants credits, changes a balance, refunds, charges, cancels a subscription, changes a store identity or accepts a receipt as proof**. It links an already delivered payment. A refunded candidate is labelled; linking cannot restore its revoked credits.

Support-role administrators can inspect but cannot submit a link. The UI and API both enforce this; the database independently rechecks the active Admin row. Responses omit receipts, store purchase tokens, Stripe checkout URLs and other customers' payment IDs. Required audit reasons must not contain credentials or unnecessary personal information.

Routes: `GET/POST /api/admin/customers/:id/native-checkouts`. POST accepts exactly `intentId`, the internal verified `transactionId`, and `reason`. The actor comes from the existing server-verified Admin session, never the body. Responses are private/no-store; writes reject cross-site requests and oversized/non-JSON bodies.

## Still not automatically resolvable

- A native sheet failed with an unknown outcome, or its explicit cancellation fails the new gated server checks. The SDK-cancellation follow-up and read-only Admin timing warnings are now implemented in `NATIVE_CANCELLATION_RECOVERY.md`; store certification is still required.
- A launched request has no safe provider evidence yet, including store-pending/Ask to Buy cases.
- Stripe has no uniquely verifiable matching session. Lost creation responses can now be recovered using the bounded, exact-account website recovery flow in `STRIPE_CHECKOUT_RECOVERY.md`; missing/ambiguous results remain protected.
- The saved transaction hint conflicts with the eligible payment; this tool does not overwrite it.
- No eligible candidate or multiple ambiguous candidates can be confidently matched.

Do not tell customers to pay again, erase audit/payment records, manually manufacture a credit grant, or release a launched lock based only on elapsed time. Unknown-payment resolution and real-store lifecycle acceptance remain release blockers. This original milestone resolves **lost selection responses and verified-payment linking**; the later SDK cancellation milestone is documented separately.

## Migration and verification

Main migration `20260909072646_native_checkout_support.sql` follows the preceding nine native migrations. All mobile migrations (now nineteen including subsequent work) remain unapplied to customer databases. It creates a private audit table with RLS and no direct service-role table writes, plus explicitly service-only functions. Existing rollout gates remain false.

Verified locally: ten-migration synthetic PostgreSQL replay; ownership/environment/role checks; stale and cross-account transaction rejection; unchanged balances; idempotent audit; concurrent launch/recovery; app lost-response recovery; API input/privacy boundaries. Admin interactive fixture tests use no live data or credentials.

Reproduce offline browser QA: `node scripts/preview-checkout-support.mjs`. Generated files are under `output/playwright/web-billing/`; the entire Admin API is replaced at build time with an in-memory sample. This is not evidence of real store or production operation.
