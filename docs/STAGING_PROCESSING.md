# Staging processing checkpoint — 9 September 2026, evening

## Connected and verified

- Private bucket `furnio-mobile-staging-assets`; new credential is Object Read & Write for **this bucket only**. Existing production credentials/bucket were not changed.
- Credentials live only in staging Worker secrets and ignored mode-0600 local files. Never include them in Expo or commits.
- Real JPEG presign → R2 upload → existing customer completion → Cloudflare watermark preview succeeded twice. Unsigned uploads, unverified customers, another customer's project, cross-account completion/preview, and unsigned bucket access were rejected. Repeated completion is safe; balances did not change. Evidence: `output/staging-media-acceptance.json`, `output/staging-upload-preview.jpg`.
- This is **hosted API/storage acceptance**, not yet native photo-picker acceptance or a paid generation pass.
- Configuration-only read from production through Supabase's dedicated read-only endpoint. Staging now matches all **9 enabled services**, 5 model records, 15 prompt presets, image pipeline/disclosure settings and trial policy. Existing staging IDs are retained; model references are translated by provider/endpoint. No customer/media/payment records copied. Snapshot SHA-256: `4a00836642c47a715164b76ebeae41ffff00a7d9d80ac22f190400fb3fb3bf75`.
- **Trial correction:** staging had intentionally been seeded disabled; production Admin has it enabled. Staging policy now also allows 3 watermarked outputs for virtual staging/twilight. This configuration change does not retroactively grant/reset trials for accounts that verified while it was disabled. Those earlier test accounts need a deliberate staging-only repair or a fresh verification test; do not claim it happened automatically.

## Deployed staging resources

| Worker | Purpose |
| --- | --- |
| `furnio-api-mobile-staging` | Existing customer handlers; isolated staging gate, database, storage and 5 producer queues |
| `furnio-mobile-staging-media` | Existing result processing implementation |
| `furnio-mobile-staging-floorplan` | Existing PDF preprocessing and floor-plan result implementation |
| `furnio-mobile-staging-reference-furniture` | Existing reference/pin preprocessing and result implementation |

Customer API deployment: `7cda5be1-783c-452a-ba1e-90c88f2ed346`. Three processor deployments and their subsequent database/storage secret installation succeeded. Their public URLs are disabled. Five isolated queues plus five matching dead-letter queues were created; production queues are unchanged.

Staging-only quote checks, result-source comparisons and submission recovery are enabled. **The owner created the FAL key in the dashboard and explicitly requested that it be copied.** Its inference-only API scope was observed, copied through the UI, saved mode 0600 in ignored `.env.staging-fal.local`, and installed into all four staging Workers (consumers first, customer entrypoint last). No second key was created; existing keys were not changed. No generation was submitted.

**23 hosted processing preflight checks passed after FAL connection:** every service rejects missing authentication, missing credit confirmation and malformed inputs; unsigned FAL callbacks return 401; website job aliases and Stripe checkout remain blocked. Fixture job count and balance stayed unchanged. Evidence: `output/staging-processing-preflight.json`. Stripe, Focus, Admin and email writes remain blocked. Production rollout flags/configurations were not deployed.

151 focused API tests passed, including staging isolation, credit quotes, recovery and result ownership. Targeted lint and diff checks passed.

## Immediate next actions

1. **Await owner's response to the requested maximum US$5 FAL test budget.** The created key is already saved/installed; do not ask for another key. Its API scope cannot manage keys/billing/compute, but is not a bucket-style resource restriction.
2. No paid generation has been performed. Current configured Nano Banana Pro 1K/2K is advertised at $0.15/output; GPT Image 2 cost is token/quality dependent. Do not imply a fixed price for every job or let automated retries exceed approval.
3. Repair the one earlier, genuinely phone-verified staging test account's missing trial deliberately, or exercise a new complete verification. Do not reset phone claims, rate limits or existing trial usage. Production is never the repair target.
4. Test actual native upload → generation → verified callback → output → save/share, all nine services, masks, multi-view, PDF and reference furniture. Verify prompt snapshots against the copied Admin presets and confirm credit/trial consumption and failed-job restoration.
5. Finish native map token and physical iPhone/Android testing. Neither app has been submitted; broader release gates remain in `PROGRESS.md`.

## Reusable commands

- `node scripts/staging-service-config.mjs --verify` — fresh read-only production comparison.
- `node scripts/staging-service-config.mjs --apply-staging` — config-only staging update with protected before snapshot; never production writes.
- `node scripts/verify-staging-media.mjs --staging-only` — creates a labelled synthetic project/upload, no paid generation. Its generation-blocked assertion must be updated once FAL is deliberately connected.
- `node scripts/deploy-staging-processors.mjs --staging-only` — exact staging configuration validation, deploys existing processor source and installs existing staging database/storage secrets; does not install a FAL key.
- `node scripts/verify-staging-processing.mjs --preflight` — validates hosted routing/security without any valid generation request.
- `node scripts/staging-fal-key.mjs --install` — reuses the already saved owner-created key; pins four staging Workers. Do not rerun `--copy` or create another key.
