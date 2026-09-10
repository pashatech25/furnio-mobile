import { normalizedPoint, type Stroke } from "./geometry";
export type MaskViewport = { zoom: number; x: number; y: number };
type Size = { width: number; height: number };
type Touch = { locationX: number; locationY: number };
type Event = { nativeEvent: Touch & { touches?: readonly Touch[] } };
export const initialViewport: MaskViewport = { zoom: 1, x: 0, y: 0 };
export function boundViewport(view: MaskViewport, size: Size): MaskViewport {
  const zoom = Math.max(1, Math.min(6, view.zoom));
  return { zoom, x: Math.min(0, Math.max(size.width * (1 - zoom), view.x)), y: Math.min(0, Math.max(size.height * (1 - zoom), view.y)) };
}
export function photoPoint(touch: Touch, view: MaskViewport, size: Size) {
  return normalizedPoint((touch.locationX - view.x) / view.zoom, (touch.locationY - view.y) / view.zoom, size.width, size.height);
}
const pair = (touches: readonly Touch[]) => ({
  x: (touches[0]!.locationX + touches[1]!.locationX) / 2,
  y: (touches[0]!.locationY + touches[1]!.locationY) / 2,
  distance: Math.max(1, Math.hypot(touches[0]!.locationX - touches[1]!.locationX, touches[0]!.locationY - touches[1]!.locationY)),
});
export function createViewportGesture(options: {
  layout: Size; brush: number; getView: () => MaskViewport;
  view: (view: MaskViewport) => void; preview: (stroke: Stroke | null) => void;
  commit: (stroke: Stroke) => void; drawing: (active: boolean) => void;
}) {
  let stroke: Stroke | null = null;
  let navigation = false;
  let pinch: { start: ReturnType<typeof pair>; view: MaskViewport } | null = null;
  const ready = () => options.layout.width > 0 && options.layout.height > 0;
  const update = (event: Event) => {
    const touches = event.nativeEvent.touches ?? [event.nativeEvent];
    if (touches.length >= 2) {
      navigation = true; stroke = null; options.preview(null);
      const current = pair(touches);
      if (!pinch) pinch = { start: current, view: options.getView() };
      const zoom = Math.max(1, Math.min(6, pinch.view.zoom * current.distance / pinch.start.distance));
      options.view(boundViewport({ zoom,
        x: current.x - (pinch.start.x - pinch.view.x) * zoom / pinch.view.zoom,
        y: current.y - (pinch.start.y - pinch.view.y) * zoom / pinch.view.zoom,
      }, options.layout));
    } else if (!navigation && touches.length === 1) {
      const next = photoPoint(touches[0]!, options.getView(), options.layout);
      stroke = stroke ? { ...stroke, points: [...stroke.points, next] } : { size: options.brush, points: [next] };
      options.preview(stroke);
    }
  };
  const finish = () => { stroke = null; navigation = false; pinch = null; options.preview(null); options.drawing(false); };
  return {
    onStartShouldSetPanResponder: ready, onMoveShouldSetPanResponder: ready,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event: Event) => { if (!ready()) return; options.drawing(true); update(event); },
    onPanResponderStart: (event: Event) => { if ((event.nativeEvent.touches?.length ?? 0) >= 2) update(event); },
    onPanResponderMove: update,
    onPanResponderRelease: () => { try { if (stroke && !navigation) options.commit(stroke); } finally { finish(); } },
    onPanResponderTerminate: finish,
  };
}
