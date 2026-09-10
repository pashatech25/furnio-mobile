import { describe, expect, it, vi } from "vitest";
import { createMaskGesture } from "./mask-gesture";
import { strokeBounds } from "./geometry";
const event = (x: number, y: number) => ({
  nativeEvent: { locationX: x, locationY: y },
});
function setup(layout = { width: 300, height: 200 }) {
  const preview = vi.fn(),
    commit = vi.fn(),
    drawing = vi.fn();
  return {
    preview,
    commit,
    drawing,
    handlers: createMaskGesture({
      layout,
      brush: 52,
      preview,
      commit,
      drawing,
    }),
  };
}
describe("native mask stroke ownership", () => {
  it.each([
    [30, 270],
    [270, 30],
  ])(
    "paints horizontally from %s to %s without surrendering the gesture",
    (start, end) => {
      const t = setup();
      expect(t.handlers.onStartShouldSetPanResponder()).toBe(true);
      t.handlers.onPanResponderGrant(event(start, 100));
      expect(t.drawing).toHaveBeenLastCalledWith(true);
      expect(t.handlers.onPanResponderTerminationRequest()).toBe(false);
      t.handlers.onPanResponderMove(event(end, 100));
      t.handlers.onPanResponderRelease();
      expect(t.commit).toHaveBeenCalledExactlyOnceWith({
        size: 52,
        points: [
          { x: start / 300, y: 0.5 },
          { x: end / 300, y: 0.5 },
        ],
      });
      expect(t.preview).toHaveBeenLastCalledWith(null);
      expect(t.drawing).toHaveBeenLastCalledWith(false);
    },
  );
  it("commits a tap as a dot and gives both directions the same mask bounds", () => {
    const t = setup();
    t.handlers.onPanResponderGrant(event(150, 100));
    t.handlers.onPanResponderRelease();
    expect(t.commit.mock.calls[0]![0].points).toEqual([{ x: 0.5, y: 0.5 }]);
    const forwards = {
      size: 52,
      points: [
        { x: 0.1, y: 0.5 },
        { x: 0.9, y: 0.5 },
      ],
    };
    expect(strokeBounds([forwards], 2048, 1365)).toEqual(
      strokeBounds(
        [{ ...forwards, points: [...forwards.points].reverse() }],
        2048,
        1365,
      ),
    );
  });
  it("cancels interrupted paint and restores page scrolling", () => {
    const t = setup();
    t.handlers.onPanResponderGrant(event(30, 100));
    t.handlers.onPanResponderMove(event(100, 100));
    t.handlers.onPanResponderTerminate();
    t.handlers.onPanResponderRelease();
    expect(t.commit).not.toHaveBeenCalled();
    expect(t.drawing).toHaveBeenLastCalledWith(false);
    expect(t.preview).toHaveBeenLastCalledWith(null);
  });
  it.each([0, -1, NaN, Infinity])(
    "does not capture an unmeasured/invalid layout (%s)",
    (width) => {
      const t = setup({ width, height: 200 });
      expect(t.handlers.onStartShouldSetPanResponder()).toBe(false);
      expect(t.handlers.onMoveShouldSetPanResponder()).toBe(false);
      t.handlers.onPanResponderGrant(event(10, 10));
      t.handlers.onPanResponderRelease();
      expect(t.commit).not.toHaveBeenCalled();
    },
  );
  it("ignores invalid locations and clamps a stroke leaving the photo", () => {
    const t = setup();
    t.handlers.onPanResponderMove(event(20, 10));
    expect(t.preview).not.toHaveBeenCalled();
    t.handlers.onPanResponderGrant(event(30, 20));
    t.handlers.onPanResponderMove(event(NaN, 50));
    t.handlers.onPanResponderMove(event(999, -5));
    t.handlers.onPanResponderRelease();
    expect(t.commit.mock.calls[0]![0].points).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 1, y: 0 },
    ]);
  });
  it("restores scrolling even if committing fails", () => {
    const t = setup();
    t.commit.mockImplementation(() => {
      throw new Error("commit failed");
    });
    t.handlers.onPanResponderGrant(event(30, 20));
    expect(() => t.handlers.onPanResponderRelease()).toThrow("commit failed");
    expect(t.drawing).toHaveBeenLastCalledWith(false);
    expect(t.preview).toHaveBeenLastCalledWith(null);
  });
});
