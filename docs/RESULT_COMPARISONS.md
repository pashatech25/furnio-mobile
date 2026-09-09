# Result comparisons — explicit original per output

Implemented locally on 9 September 2026. **Disabled and undeployed; not staging or physical-device certified.**

## Customer behaviour

- Each completed multi-view result compares against its own uploaded original. Choosing the second or third upload as the design anchor does not change that pairing.
- Known view numbers reflect upload order, not processing order. Selection stays attached to an output asset ID when polling adds or reorders outputs.
- Partially finished jobs may show their available outputs with the progress card. One completed result is not evidence that its job had only one source.
- Each locked output retains its server-provided watermarked URL. Selecting another output never substitutes the top-level anchor preview or derives a clean master URL.
- Missing, expired or un-loadable originals produce an explanatory notice. The finished result remains independently available. Refresh obtains signed URLs and retries image loading, not generation.
- The slider activates only after the matching original loads. Images have separate keys; late load/size callbacks and stale job refreshes cannot replace a newly selected image. Account/job changes remount the private result screen.
- The development demonstration retains its existing labelled sample before/after pair. No real photos or paid generations were created for these checks.

## Additive API contract

The app reads `GET /api/jobs/:jobId?includeSources=1` through existing customer authentication and ownership checks. The customer API additionally requires `MOBILE_RESULT_COMPARISONS_ENABLED=true` in an approved environment.

Each member of `results` may add:

```ts
source?: null | {
  assetId: string;    // verified original source UUID
  previewUrl: string; // signed original preview, not a master or furniture reference
  expiresAt: string;  // ISO timestamp for this signed preview
  viewIndex: number | null; // zero-based upload index; null for single-source work
};
```

The source comes from stored `job_steps.input.source_asset_id`, checked against the job input. Multi-view checks membership in `job.input.source_asset_ids` and any recorded `view_index`. It never indexes sources with `step_index`, which is anchor-first processing order.

Checks include requesting user, job/step/output linkage, owned ready source/result records, matching non-null project IDs, retention and the exact canonical source-preview key. Only `in/{userId}/{assetId}/preview.jpg` is signed. Private prompts, provider requests, masters and furniture-reference URLs are not returned by the new field. A PDF without a prepared source preview gets `source: null`.

Source URL lifetime is capped by both source/result retention deadlines and the existing preview TTL. The app disables comparison at the returned expiry. Optional lookup/signing failures degrade to `null` without breaking status retrieval. Repeated single-source steps share only a request-local lookup cache.

Opted-in responses use `Cache-Control: private, no-store`. With the flag false, without the exact query value, or for internal developer credentials, there is no extra source lookup and no new property. Existing fields and prompt/processing logic stay unchanged. Older responses show results without comparison; the app does not fall back to ambiguous project-history sources.

## Changed code

- Main: shared `jobs.ts` schema; API `lib/result-source.ts`, optional branch in `routes/jobs.ts`, regression fixture `routes/result-source.test.ts`, disabled flag and generated environment type.
- Mobile: frozen shared contract/manifest import, `src/results/result-view.ts` and tests, `app/result/[jobId].tsx`.
- No new migration, secret, Admin prompt, web UI change or imaging-consumer deployment. The shared API Worker eventually needs a release with its flag disabled before approved activation.

## Local evidence

- 46 new API tests: non-first anchors, partial sets, ownership/project relationships, invalid/missing/expired originals, canonical preview keys, trial protection, optional failures, retention TTL, cache isolation and legacy behaviour.
- 18 new mobile tests: stable asset selection, view ordering, old contracts, partial sets, protected trial URLs, source expiry/URL rejection and stale-request invalidation.
- Full suites: **486 mobile tests / 32 files; 235 API tests / 23 files; 49 web tests / 13 files; 10 shared tests**.
- Mobile, mobile Worker and web TypeScript pass. Targeted API lint passes. Main's baseline comparison still reports the same four unrelated reference-furniture diagnostics; it is not a clean full API typecheck.
- API dry-run: **1978.19 KiB / 306.22 KiB gzip**, flag false; not deployed.
- Native iOS Release simulator build/config check passed: `output/ios-simulator-2026-09-09T11-19-44.216Z.log`.
- Installed/launched in the dedicated Furnio Mobile QA iPhone simulator. Sample login → project → result and the before/after slider were visually checked. This is native demo evidence, **not a real remote multi-view job or full-resolution export**.

## Remaining acceptance gates

1. Replay approved staging jobs with 2–4 views, non-first anchors, in-progress/partial results, expired sources and absent PDF previews. Use fixtures/mocked processing unless paid generation is approved.
2. Verify real staging ownership rejection and source pixels. Unit tests mock the owned-record functions; they are not live database/HTTP evidence.
3. Exercise rapid selection, background/resume, refresh races, account switches and unavailable storage on physical iOS/Android devices.
4. Re-run web/customer/developer regressions and capture deployed version IDs before activation.
5. Keep the production flag false until accepted. Rollback removes optional comparisons only; it must not cancel paid jobs or alter records.
