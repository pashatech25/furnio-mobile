# Web and approved-prototype parity corrections — September 9, 2026

Owner reported broken address lookup, unapproved UI differences, free-text room/style fields and watermarked before images.

## Implemented and installed

- Web catalogue mirrored with a local parity test: 10 room types, 14 furniture styles and 7 moods, including exact submitted values and default empty preference. Virtual staging and multi-view now use native visual selection rails; no free-text replacement fields.
- Login hero restored to approved prototype's full-width image, in-image logo and heading. Studio heading/progress restored and property chooser collapsed. This is not a declaration that every screen matches the artifact; remaining screens require visual review.
- Optional mobile result comparison returns only the verified owned JPEG original as before, rather than its watermarked preview. Owner, source-kind, project, exact canonical original key, recorded job/step pairing and retention checks remain. Trial-generated after/master restrictions are unchanged. No change to old web responses without includeSources.
- Production API version `450b8ebb-ec89-4037-8286-819cd61a3332`. No imaging workers or database migrations changed in this correction.
- 1,097 mobile tests and mobile TypeScript passed; isolated release API 178 tests passed. Both production emulator/simulator builds compiled and installed.
- Android build SHA256 `f3166e3ea660ed91e84ee3a0b2fb9eb7e780c656c6f91f7590935186ea856cf7`.

## Still outstanding

- Separate mobile Mapbox token created September 10, with styles:read and styles:tiles only, no secret scopes, no URL restrictions. Website token unchanged. Native-style requests now return HTTP 200 for both address suggestions (5 matches) and PNG map preview. Public token stored in ignored `.env.mobile-map.local`; production configuration preparation requires that mobile-specific file. Updated native builds/visual verification in progress.
- Complete approved-artifact visual parity audit across all screens, not only the login and studio corrections.

## Observed real production evidence

- Updated iPhone staging screen showed all visual options with radio selection states and actual account balance 970 credits.
- Owner's App test project showed an existing succeeded virtual-staging job. No new generation or credit spending initiated by the agent during these checks.
- Opened that actual result and visually confirmed the before half uses the clean empty-room original.
- September 10: responsive rails show 2.5 cards using measured container width; twilight shows all three web preset pictures together. Existing preset values and server processing logic unchanged. Selected descriptive text is below the rail rather than crowding the cards.
- Both production-configured simulator/emulator builds rebuilt and installed September 10. Android SHA256 `3f1e139632be2937f5e19bfc911fa1a6b41558a22da75e4e230b17b3cf9bae4c`. iPhone screenshot confirms two full room cards plus half the third and equivalent furniture rail. Map HTTP checks pass, but in-app map/twilight visual check remains pending after simulator UI control lost its window to the Help menu. Do not count API checks as completed device UI checks.
