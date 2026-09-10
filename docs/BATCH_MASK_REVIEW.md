# Native batch mask review

9 September 2026, about 12:15 Toronto. Local mobile implementation and simulator evidence only; no production deployment.

## What changed

- **Save review & next photo** now prepares real mask PNGs in an iOS/Android demo build. The old check blocked every demo, even native builds, with a message saying to use a native build. Browser mask review remains design-only. Sample batch submission still returns before any reservation, upload, journal write or job API call.
- One synchronous review lock prevents overlapping exports. Photo selection/edit controls are unavailable while review is preparing. An invalidated or unmounted screen ignores a late export before writing masks or marking a photo reviewed. Successful reviews update the stable photo ID rather than whichever index happens to be selected later.
- The temporary-mask store owns only fresh cache files it allocated. It validates every encoded mask before writing, registers destinations before create/write, and attempts cleanup of each failed copy independently.
- Re-review first prepares and validates replacement masks. Failure leaves the previous saved review intact; success retires only that photo's previous files. Removing a photo or leaving Batch cleans its owned masks. Original Photos/Files images are never passed to this cleanup store.
- Failed/silent deletions remain tracked for **Retry temporary-mask cleanup**. Further preparation/submission is blocked until cleanup succeeds, preventing repeated failures from silently accumulating files during the screen session. A valid replacement is not reported as failed merely because cleanup of an older copy is pending.
- Trial restrictions, service permissions, server pricing, reservation expiry/refunds, Admin prompts, production upload contracts and job processing remain unchanged.

## Tests and actual simulator findings

`pnpm check`: **687 tests / 45 files**, TypeScript and frozen API contracts passed. Fifteen new tests cover mask-file ownership/replacement/partial failures, independent cleanup/retry, pre-existing destination protection, result-mutation isolation, invalid region counts/payloads, overlapping reviews, unmount invalidation and recovery after failure. Unit PNG bytes are an encoding fixture; native pixels were inspected separately.

Release/configuration build passed: `output/ios-simulator-2026-09-09T16-11-06.056Z.log`. Installed in Furnio Mobile QA with demo mode and no signing. Built and installed JS SHA256 matched: `fbee7a258968573c52c622439421a645b01cfd8343822de8aace834265c0891e`.

Native UI sequence, using only two Apple simulator stock photos:

1. Create → Edit a batch of photos → Item removal → select flower and waterfall images in the system multi-photo picker.
2. Saving an empty selection showed the Furnio modal **Paint at least one area on the photo**. No photo was marked reviewed.
3. Paint Photo 1, save review, automatically advance to Photo 2. Paint/review Photo 2. Submission was disabled at 0/1 reviews and enabled only at 2/2.
4. Four actual cache PNGs existed: binary/composite pairs at **2048×1536** and **2048×1367**. The two binary files were opened and visibly contained different paint locations, not blank masks or the other photo's selection.
5. Switch back to Photo 1: its review and painted point persisted. Add another point: only Photo 1 became **Needs review**, and submission became unavailable again.
6. Re-review Photo 1: the two old Photo 1 PNG files were gone, its two replacements existed, and Photo 2's exact two filenames remained. Total stayed at four. The new Photo 1 binary was opened and contained both the preserved and newly added points.
7. Explicitly confirm **sample processing only**. The preview showed two sample queued records, not real jobs. Use the visible Back button: returned to Create, still 125 sample credits. Read-only cache inspection then found **zero** `furnio-batch-mask-` files.

No photo was uploaded, no credit reservation or FAL job was made, and no store purchase was started. The only files removed were disposable mask copies made by this test; original stock images remain available. No listener, Docker restart or network configuration change was needed.

## Still required

- Automated native drags produced individual points, not long painted strokes. The owner's separate human all-direction brush acceptance remains passed; larger exported shapes and brush-size variation still need their own test.
- Custom staging instructions, eight-region/high-photo-count stress, photo removal, low storage, interruptions, real device/Android and authenticated staging batches require further acceptance. Unit tests do not substitute for these.
- The ownership registry is currently in memory. Crash/restart orphan cleanup, SDK-generated picker copies and failure retention after screen destruction remain part of the broader device-data lifecycle work. No whole-cache wipe or claim of complete device erasure was added.
- Full-resolution disclosure JPEG saving/sharing is the next distinct native test. Batch PNG success does not certify it.

See `NATIVE_MASK_REVIEW.md` for the pinned iOS SVG pixel/bounds patch and local cached Release dependency caveat; `LAPTOP_SETUP.md` for the four still-missing Android SDK packages.
