# Store artwork — 10 September 2026

## Approved artwork

- Six native iPhone screenshot compositions, 1320 × 2868.
- Six native Android screenshot compositions, 1080 × 1920.
- Six native iPad screenshot compositions, 2048 × 2732.
- Approved Google Play feature graphic, 1024 × 500.
- Official brand icon exports, 1024 × 1024 and 512 × 512.
- Interactive `artwork.html` gallery and full-resolution PNGs in `exports/`.

The owner approved the complete screenshot and icon set on 10 September 2026, after reviewing the gallery. The feature graphic was approved earlier. No artwork has been uploaded and neither store submission has been completed by this artwork task.

## Capture provenance

Screens are captured separately from actual iOS and Android native builds, not the HTML prototype. The existing demonstration account supplies fictional projects and balances. The local screenshot fixture enters that account, traverses existing routes, scrolls the editor, hides development-only notices, and uses the production Create label. It never connects to production or performs AI generation.

`capture-fixture.patch` documents the temporary fixture. It has been removed from all app source files after building. Do not apply it to a release or submit the local screenshot binaries. The physical customer iPhone was not modified. Production authentication, billing, business rules, and Workers are unchanged.

The screenshot sequence covers Home, service selection, staging controls, twilight controls, results, and projects. The figures are illustrative account data, not a credit offer. Preserve the screenshot controls in the release binary; recapture whenever visible release UI changes.

## Rendering

`export-artwork.mjs` renders using the Playwright CLI against the local gallery at port 4347. It checks that screenshot images are loaded and waits for typography before exporting. `capture-native.mjs` is exclusively for the local screenshot-fixture simulators; it is not a general release test or proof of live processing.

Store release still requires the separate release checklist, privacy/account-deletion readiness, signing/build upload, store forms, and the owner's final approval. Artwork completion does not certify those gates.
