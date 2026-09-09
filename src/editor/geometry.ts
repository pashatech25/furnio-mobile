export type Point = { x: number; y: number };
export type Stroke = { points: Point[]; size: number };
export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function normalizedPoint(
  x: number,
  y: number,
  width: number,
  height: number,
): Point {
  if (width <= 0 || height <= 0) throw new Error("Photo layout is not ready.");
  return { x: clamp(x / width), y: clamp(y / height) };
}
export function strokeBounds(strokes: Stroke[], width: number, height: number) {
  const visible = strokes.filter((stroke) => stroke.points.length);
  if (!visible.length) throw new Error("Paint an area first.");
  let left = 1,
    top = 1,
    right = 0,
    bottom = 0;
  for (const stroke of visible)
    for (const point of stroke.points) {
      left = Math.min(left, clamp(point.x - stroke.size / width / 2));
      right = Math.max(right, clamp(point.x + stroke.size / width / 2));
      top = Math.min(top, clamp(point.y - stroke.size / height / 2));
      bottom = Math.max(bottom, clamp(point.y + stroke.size / height / 2));
    }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function pathFor(stroke: Stroke, width: number, height: number) {
  return stroke.points
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${point.x * width},${point.y * height}`,
    )
    .join(" ");
}
