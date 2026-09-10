# Trial downloads and processing feedback — September 10, 2026

Compared website app.stage.tsx, enhancement-page.tsx and lib/staging.ts with native result screen. Mobile wrongly returned early for all trial exports and exposed only Unlock. Its queued/running state was a static text card.

Native now requests the same authenticated `/api/assets/:assetId/preview` route used by the website for locked trial output. Saves/shares exact server-watermarked bytes through the existing private temporary export lifecycle. It never fetches the clean master or tries to remove/recreate the watermark. Paid output retains its existing download and disclosure renderer. Trial Save/Share appear separately from Unlock; no backend, billing or trial rules changed.

Added native website-derived processing feedback: exact Furnio monogram SVG path, 1.8-second orbit/pulse and 1.7-second indeterminate line, bone/terracotta on forest. Submission shows the animation; queued/running result displays it until actual server completion. Batch feedback stays inline to preserve existing controls. No fabricated percentage. Reduced motion, blur, background and unmount stop loops. This is a native rendition, not a claim that all service-specific web animations are identical.

Validation: TypeScript, 90 tests in src/results, and diff whitespace check pass. Includes trial-preview vs paid-download route regression. Physical Save/Share and processing visual acceptance still require owner verification; no paid generation started by agent.

Full suite: 1,106 tests / 69 files passed. Final iOS device build 05-57-17.619Z and Android release build 05-57-18.773Z passed, including embedded configuration checks. Android APK SHA256: 83ab7027eca4de82ce2bf2eb1efebcd2181411294b27e8823df4a03d2136af43. Android device installation not claimed.
