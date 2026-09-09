import { describe, expect, it } from "vitest";
import { normalizedPoint, pathFor, strokeBounds } from "./geometry";
import {
  defaultDisclosure,
  disclosureSchema,
  placement,
  positions,
} from "./disclosure-settings";
describe("native image geometry", () => {
  it("normalizes view coordinates to the source image", () =>
    expect(normalizedPoint(100, 50, 200, 100)).toEqual({ x: 0.5, y: 0.5 }));
  it("clamps furniture placements to image bounds", () =>
    expect(normalizedPoint(-40, 300, 100, 100)).toEqual({ x: 0, y: 1 }));
  it("rejects unmeasured image geometry", () =>
    expect(() => normalizedPoint(0, 0, 0, 0)).toThrow());
  it("includes brush radius in the normalized bounding box", () =>
    expect(
      strokeBounds([{ size: 100, points: [{ x: 0.5, y: 0.5 }] }], 1000, 1000),
    ).toEqual({
      x: 0.45,
      y: 0.45,
      width: 0.10000000000000003,
      height: 0.10000000000000003,
    }));
  it("does not paint beyond the image in the bounding box", () => {
    const bounds = strokeBounds(
      [
        {
          size: 100,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      100,
      100,
    );
    expect(bounds).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
  it("rejects an empty mask", () =>
    expect(() => strokeBounds([], 100, 100)).toThrow());
  it("produces source-resolution SVG paths", () =>
    expect(
      pathFor(
        {
          size: 20,
          points: [
            { x: 0, y: 0 },
            { x: 0.5, y: 0.5 },
          ],
        },
        1000,
        500,
      ),
    ).toBe("M0,0 L500,250"));
  it.each(positions)("keeps disclosure %s inside the image", (position) => {
    const result = placement({ ...defaultDisclosure, position }, 2048, 1365);
    expect(result.x).toBeGreaterThan(0);
    expect(result.x).toBeLessThan(2048);
    expect(result.y).toBeLessThan(1365);
    expect(result.y).toBeGreaterThan(0);
  });
  it("validates the supported disclosure controls", () =>
    expect(disclosureSchema.parse(defaultDisclosure)).toEqual(
      defaultDisclosure,
    ));
  it.each([
    { opacity: 0 },
    { color: "url(https://outside)" },
    { fontSize: 200 },
    { text: "x".repeat(81) },
  ])("rejects an invalid disclosure setting", (change) =>
    expect(() =>
      disclosureSchema.parse({ ...defaultDisclosure, ...change }),
    ).toThrow(),
  );
});
