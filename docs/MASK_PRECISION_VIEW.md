# Native mask precision view

Added shared MaskEditor view controls for item removal/custom masks: one-finger brush, 1–6× pinch zoom, bounded two-finger pan, Reset view, and an optional floating 4:3 magnified brush preview. Uses the selected local photo and existing region colours; no uploads or processing are triggered by zoom.

The viewport transforms only the displayed photo and overlay. Touches are inverted to normalized original-photo coordinates; stroke sizes remain in mask pixels. Existing binary/composite export renderers are unchanged. Starting a pinch discards the pending stroke and suppresses painting until all fingers lift. Interruptions discard pending strokes and unlock page scrolling. The magnifier is pointer-events-none and shows the current brush footprint.

TypeScript and 47 gesture/viewport/export tests pass, including pinch-without-paint, inverse coordinates, bounds and interrupted gestures. Physical pinch/pan/magnifier acceptance remains pending; build/test success is not physical gesture verification.
