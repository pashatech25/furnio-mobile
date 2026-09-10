import { expect, it, vi } from "vitest";
import { boundViewport, createViewportGesture, initialViewport, photoPoint } from "./mask-viewport";
const layout = { width: 300, height: 200 };
const event = (...points: number[][]) => ({ nativeEvent: { locationX: points[0]![0]!, locationY: points[0]![1]!, touches: points.map(([locationX, locationY]) => ({ locationX: locationX!, locationY: locationY! })) } });
it("maps zoomed and panned touches back to original normalized coordinates", () => {
  expect(photoPoint({ locationX: 150, locationY: 100 }, { zoom: 3, x: -300, y: -200 }, layout)).toEqual({ x: 0.5, y: 0.5 });
});
it("limits zoom and prevents panning outside the photo", () => {
  expect(boundViewport({ zoom: 9, x: -9000, y: 100 }, layout)).toEqual({ zoom: 6, x: -1500, y: 0 });
  expect(boundViewport({ zoom: 0.5, x: -10, y: -10 }, layout)).toEqual(initialViewport);
});
it("pinches around the fingers without committing accidental brush marks", () => {
  let view = initialViewport;
  const commit = vi.fn(), preview = vi.fn();
  const handler = createViewportGesture({ layout, brush: 52, getView: () => view, view: value => { view = value; }, commit, preview, drawing: vi.fn() });
  handler.onPanResponderGrant(event([100, 100]));
  handler.onPanResponderStart(event([100, 100], [200, 100]));
  handler.onPanResponderMove(event([50, 100], [250, 100]));
  expect(view).toEqual({ zoom: 2, x: -150, y: -100 });
  handler.onPanResponderMove(event([100, 100]));
  handler.onPanResponderRelease();
  expect(commit).not.toHaveBeenCalled();
  handler.onPanResponderGrant(event([150, 100]));
  handler.onPanResponderRelease();
  expect(commit).toHaveBeenCalledWith({ size: 52, points: [{ x: 0.5, y: 0.5 }] });
});
it("cancels an interrupted stroke and releases page scrolling", () => {
  const commit = vi.fn(), drawing = vi.fn();
  const handler = createViewportGesture({ layout, brush: 12, getView: () => initialViewport, view: vi.fn(), commit, preview: vi.fn(), drawing });
  handler.onPanResponderGrant(event([20, 30]));
  handler.onPanResponderTerminate();
  expect(commit).not.toHaveBeenCalled();
  expect(drawing).toHaveBeenLastCalledWith(false);
});
