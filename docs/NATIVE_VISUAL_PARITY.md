# Native visual parity — September 10

The website is the source of truth for service choices, imagery and business rules. The approved mobile artifact remains unchanged.

- Room/style/mood choices preserve the web catalogue labels and submitted values. Cards are 4:3, show 2.5 across, and place small bone-coloured labels over a bottom gradient.
- Twilight uses the web's preset imagery, except natural dusk uses the owner's explicitly supplied `furnio-twilight-aaccfae5-d076-487d-82fa-1047194b3e4a.jpg`.
- Virtual staging's service poster is the owner's `furnio-matched-view-1.jpg`. The animation remains the original web service preview, not an invented before/after pairing with that photo.
- Eight existing web WebM previews were transcoded to silent H.264 MP4 without changing their animation. Reference furniture reuses its web room, furniture and result assets with a native 6.4-second placement/pin/blend sequence based on its web keyframes.
- Service names sit at the bottom left over a gradient. Native playback respects Reduce Motion, screen focus and app backgrounding.
- Page header stays outside the ScrollView. Studio's original Create button, confirmation and submit callback moved unchanged into a fixed safe-area footer.

## Verification

- New project now defaults to address lookup; individual street/city/region/postal/country fields appear only under Manual address. Both modes retain entered values. Project name remains editable, optional unit entry is expandable, and Create stays in the fixed footer. Selecting a result reveals the Mapbox light map with a forest-green pin in a soft cream/green frame. No placeholder map card before selection. Lookup mode cannot silently submit an old address after the query changes. Existing structured project payload is preserved. TypeScript and five address tests pass; iPhone/Android builds pass.

- Mobile TypeScript and 1,098 tests passed after these UI changes.
- iPhone screenshot verified service names in bone at bottom left over photo gradients; successive screenshots verified the original web virtual-staging animation progressed from empty to furnished.
- iPhone studio screenshot verified landscape 4:3 cards, image-overlay labels, 2.5 visible choices, fixed header and bottom Create action while scrolled.
- Additional downloaded twilight candidates were not used. They were moved to ignored output storage; only canonical web assets and the two explicitly supplied replacements are referenced.
- These checks do not constitute testing all nine paid generation services or completion of the native camera reward interface.

## Existing acquisition rules, not new rules

The login hero badge reads the existing public trial enabled flag and output limit. It uses web Caveat 600, terracotta `#a84d30`, writing reveal and underline. Its accessibility preference starts unresolved with zero reveal, avoiding a fully visible first frame before animation. Reduced-motion users receive a static badge once the preference resolves. The hero overlay is a gradient, not a solid rectangular panel.

Owner supplied `floraphonic-pencil-foley-write-3-162852.mp3`, copied unchanged to `assets/pencil-writing.mp3` (ffprobe duration 2.952s). Text takes 72% and underline 28% of the decoded clip duration. Sound starts with the reveal, volume 40%, no looping, iOS silent mode respected, no microphone/background playback permissions. Screen blur/unmount or app background stops the effect; Reduce Motion uses static lettering without the sound. Failure to load audio falls back to a silent reveal rather than blocking login.

The app reads `/api/trial`, uses server-provided allowed services/limits and submits to existing customer job endpoints. Complimentary preview eligibility is still enforced there. No new complimentary entitlement is granted locally.

Furnio Focus is the camera reward feature found in the web code (the owner called it Lens/Lense). Native has no play/bind/reward-notice UI. Already-bound reward credits are in the shared balance; discounts remain website checkout benefits. A pending browser claim is not automatically transferred into native storage. Website-only billing does not automatically implement the missing game interface. The Admin acquisition-mode switch is unchanged.
