import { normalizedPoint, type Stroke } from "./geometry";

type PaintEvent = { nativeEvent: { locationX: number; locationY: number } };
export function createMaskGesture({
  layout,
  brush,
  preview,
  commit,
  drawing,
}: {
  layout: { width: number; height: number };
  brush: number;
  preview: (stroke: Stroke | null) => void;
  commit: (stroke: Stroke) => void;
  drawing: (active: boolean) => void;
}) {
  let stroke: Stroke | null = null;
  const ready = () =>
    Number.isFinite(layout.width) &&
    layout.width > 0 &&
    Number.isFinite(layout.height) &&
    layout.height > 0 &&
    Number.isFinite(brush) &&
    brush > 0;
  const point = (event: PaintEvent) => {
    const { locationX: x, locationY: y } = event.nativeEvent;
    return ready() && Number.isFinite(x) && Number.isFinite(y)
      ? normalizedPoint(x, y, layout.width, layout.height)
      : null;
  };
  const finish = () => {
    stroke = null;
    preview(null);
    drawing(false);
  };
  return {
    onStartShouldSetPanResponder: ready,
    onMoveShouldSetPanResponder: ready,
    // Once painting starts, a containing ScrollView must not steal the stroke.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event: PaintEvent) => {
      const start = point(event);
      if (!start) return;
      stroke = { size: brush, points: [start] };
      drawing(true);
      preview(stroke);
    },
    onPanResponderMove: (event: PaintEvent) => {
      const next = point(event);
      if (!stroke || !next) return;
      stroke = { ...stroke, points: [...stroke.points, next] };
      preview(stroke);
    },
    onPanResponderRelease: () => {
      try {
        if (stroke) commit(stroke);
      } finally {
        finish();
      }
    },
    // OS interruptions may still cancel a gesture. Never commit partial paint.
    onPanResponderTerminate: finish,
  };
}
