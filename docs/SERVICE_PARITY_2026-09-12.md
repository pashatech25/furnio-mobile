# Mobile / web service comparison — 12 September 2026

Scope: current local customer-web and mobile source, request contracts, service inputs, upload metadata and result presentation. This is not a claim that nine new paid generations or Android physical-device tests were run. The web/API worktree contains existing uncommitted changes; this compares that checkout, not a separately verified production deployment snapshot.

## Fixed and installed on the connected iPhone

Custom staging and item removal produce one finished image after sequential mask-region edits. The generic job response also exposes intermediate step assets. Mobile incorrectly presented those as separate deliverables.

`src/results/result-view.ts` now uses the server's final `resultAssetId` and final delivery URL only after success for single-output services. It retains the final asset's original-photo comparison metadata, uses the protected preview for trial-locked results, and does not expose intermediate images on incomplete/failed mask jobs. Multi-view retains its individual final views. Studio, recovered submissions, project history, activity and batch links now carry service identity into the results screen. A result link without service identity conservatively shows the single final output; normal app navigation supplies the identity.

No processing Worker, model, prompt, credit rule or production database was changed by this repair. Existing completed jobs need no regeneration: reopen them from project history.

## Service findings

| Service | Request / processing comparison | Finding |
|---|---|---|
| Virtual staging | Same stage handler; source, room type, furniture style, mood and additional direction | No payload-option mismatch found |
| Matched multi-view | Same multiview handler; 2–4 views, selected anchor, room/style/mood/direction | Real multiple results retained; upload preflight difference below |
| Item removal | Same mask-edit handler with remove mode, ordered regions, binary and composite masks | Final-only result display fixed; editor differences below |
| Custom staging | Same mask-edit handler with custom mode and per-region instructions/operations | Final-only result display fixed; editor differences below |
| Twilight | Same enhancement handler, all three preset values | No payload-option mismatch found |
| Winter to summer | Same enhancement handler and feature value | No payload-option mismatch found |
| Exterior enhancement | Same enhancement handler and four selectable option values | No payload-option mismatch found |
| Floor plans | Same floorplan handler, JPEG/PDF source | No job-payload mismatch found |
| Reference furniture | Same reference-furniture handler, room plus 1–5 references and normalized placement coordinates, direction | Reference uploads exclude project source-photo quota on both clients |

Mobile's `/api/mobile/v1/jobs/*` routes and web's `/api/jobs/*` routes mount the same handlers in `apps/api/src/index.ts`. Mobile adds a confirmed-credit header rather than replacing model/prompt selection. Request constructors are `src/editor/studio-input.ts` and web `apps/web/src/lib/staging.ts` plus its service pages. Frozen shared request contracts and creative-option catalogue parity checks pass.

## Remaining differences — reported, not silently changed

1. **Mask tools:** web has an eraser; mobile has Undo/Clear region instead. Web UI allows six regions; mobile allows eight (the shared API permits eight). Mobile calculates bounds from brush geometry; web scans the rendered mask pixels. Both supply binary/composite masks, but they are not byte-identical renderers.
2. **Multi-view upload preflight:** web supplies `outputCount: views.length` to source upload reservation. Mobile currently omits it, so the shared schema defaults to one. Mobile confirms full cost before submission and the job handler still reserves the full job cost; this is an early-upload-check parity gap, not evidence of free extra outputs.
3. **Photo preparation:** mobile converts photos to JPEG at 0.95 quality and normalizes orientation (including HEIC/PNG selections). Web sends the selected JPEG bytes. Same file selection therefore does not guarantee byte-identical model input.
4. **Partial multi-view results:** mobile exposes available completed views in a partial job; the web multiview page waits for overall success before setting its result set. This is a presentation difference, not a different model request.

## Verification

- TypeScript check passed.
- Frozen customer API contract check passed.
- 91 targeted tests passed: result selection, studio input, creative-option parity and credit-quote headers.
- Production-configured signed iPhone build passed; installed on the connected iPhone (bundle `ai.furnio.app`). Build log: `output/ios-device-2026-09-12T14-57-10.340Z.log`.
- The user confirmed the preceding upload-overlay freeze repair no longer freezes. The new final-only results repair still needs their visual confirmation on the installed device.
- Android uses the same changed TypeScript logic; no new Android binary was built/installed during this repair.
- No paid generation, store upload or store resubmission performed in this task.
