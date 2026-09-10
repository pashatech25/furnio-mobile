// A horizontal brush stroke must not dismiss an editing screen. These options
// are applied only to Studio/Batch; the visible Back button remains available.
export const editorNavigationOptions = {
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
} as const;
