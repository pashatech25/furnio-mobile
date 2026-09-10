import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureMaskPng,
  decodeMaskDimensions,
  exportPaintRegions,
  type PaintRegion,
} from "./mask-export";

const dimensions = { width: 2048, height: 1365 };
// Adapter tests stub native decoding. These bytes are not a native pixel test.
const png = "iVBORw0KGgoAAAANSUhEUg==";
const region: PaintRegion = {
  instruction: "Remove the chair",
  operation: "remove",
  strokes: [
    {
      size: 52,
      points: [
        { x: 0.25, y: 0.5 },
        { x: 0.75, y: 0.5 },
      ],
    },
  ],
};
afterEach(() => vi.useRealTimers());

describe("in-memory native mask dimensions", () => {
  it("reads decoded pixels and releases both references without saving a file", async () => {
    const image = { ...dimensions, release: vi.fn(), saveAsync: vi.fn() };
    const decoder = { renderAsync: vi.fn(async () => image), release: vi.fn() };
    await expect(decodeMaskDimensions(() => decoder)).resolves.toEqual(
      dimensions,
    );
    expect(decoder.renderAsync).toHaveBeenCalledOnce();
    expect(image.saveAsync).not.toHaveBeenCalled();
    expect(image.release).toHaveBeenCalledOnce();
    expect(decoder.release).toHaveBeenCalledOnce();
  });
  it("releases the context after a rejected native decode", async () => {
    const decoder = {
      renderAsync: vi.fn(async () => {
        throw new Error("decoder failed");
      }),
      release: vi.fn(),
    };
    await expect(decodeMaskDimensions(() => decoder)).rejects.toThrow(
      "decoder failed",
    );
    expect(decoder.release).toHaveBeenCalledOnce();
  });
  it("does not replace a native constructor failure", async () => {
    await expect(
      decodeMaskDimensions(() => {
        throw new Error("constructor failed");
      }),
    ).rejects.toThrow("constructor failed");
  });
  it("still releases the context when releasing the image throws", async () => {
    const decoder = {
      renderAsync: async () => ({
        ...dimensions,
        release: () => {
          throw new Error("release failed");
        },
      }),
      release: vi.fn(),
    };
    await expect(decodeMaskDimensions(() => decoder)).resolves.toEqual(
      dimensions,
    );
    expect(decoder.release).toHaveBeenCalledOnce();
  });
  it("releases native references if reading decoded dimensions throws", async () => {
    const image = {
      get width(): number {
        throw new Error("invalid reference");
      },
      height: 640,
      release: vi.fn(),
    };
    const decoder = { renderAsync: async () => image, release: vi.fn() };
    await expect(decodeMaskDimensions(() => decoder)).rejects.toThrow(
      "invalid reference",
    );
    expect(image.release).toHaveBeenCalledOnce();
    expect(decoder.release).toHaveBeenCalledOnce();
  });
  it("keeps a pending decode alive until completion, including after the mask deadline", async () => {
    vi.useFakeTimers();
    const image = { ...dimensions, release: vi.fn() };
    let finish!: (value: typeof image) => void;
    const decoder = {
      renderAsync: () =>
        new Promise<typeof image>((resolve) => {
          finish = resolve;
        }),
      release: vi.fn(),
    };
    const capture = captureMaskPng(
      (cb) => cb(png),
      () => decodeMaskDimensions(() => decoder),
      dimensions,
    );
    const rejection = expect(capture).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(image.release).not.toHaveBeenCalled();
    expect(decoder.release).not.toHaveBeenCalled();
    finish(image);
    await vi.advanceTimersByTimeAsync(0);
    expect(image.release).toHaveBeenCalledOnce();
    expect(decoder.release).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("native PNG export adapter", () => {
  it("requires native decoding at the requested dimensions and a local data URI", async () => {
    const measure = vi.fn(async () => dimensions);
    const render = vi.fn((callback: (value: string) => void) => callback(png));
    await expect(captureMaskPng(render, measure, dimensions)).resolves.toBe(
      png,
    );
    expect(render).toHaveBeenCalledWith(expect.any(Function), dimensions);
    expect(measure).toHaveBeenCalledExactlyOnceWith(
      `data:image/png;base64,${png}`,
    );
  });
  it("rejects absent native renderer", async () => {
    const measure = vi.fn();
    await expect(captureMaskPng(null, measure, dimensions)).rejects.toThrow(
      "not ready",
    );
    expect(measure).not.toHaveBeenCalled();
  });
  it.each([0, -1, 0.5, 2049, NaN, Infinity])(
    "rejects unsafe dimensions %s before native rendering",
    async (width) => {
      const render = vi.fn();
      await expect(
        captureMaskPng(render, vi.fn(), { width, height: 100 }),
      ).rejects.toThrow("dimensions");
      expect(render).not.toHaveBeenCalled();
    },
  );
  it.each([
    "",
    "https://example.invalid/photo.png",
    "iVBORw0KGgo bad",
    "SGVsbG8=",
  ])("rejects invalid render data %s", async (value) => {
    const measure = vi.fn();
    await expect(
      captureMaskPng((callback) => callback(value), measure, dimensions),
    ).rejects.toThrow("valid PNG");
    expect(measure).not.toHaveBeenCalled();
  });
  it("rejects unexpectedly large data before asking native Image to decode it", async () => {
    const measure = vi.fn();
    await expect(
      captureMaskPng(
        (callback) => callback(png + "A".repeat(24 * 1024 * 1024)),
        measure,
        dimensions,
      ),
    ).rejects.toThrow("valid PNG");
    expect(measure).not.toHaveBeenCalled();
  });
  it("rejects real decoder failure without exposing native file paths", async () => {
    await expect(
      captureMaskPng(
        (callback) => callback(png),
        async () => {
          throw new Error("file:///private/customer.png");
        },
        dimensions,
      ),
    ).rejects.toThrow("The exported mask could not be opened.");
  });
  it("enforces the decoded 5 MB limit even at the base64 padding boundary", async () => {
    const encodedLength = Math.ceil((5 * 1024 * 1024) / 3) * 4;
    const value = "iVBORw0KGgo" + "A".repeat(encodedLength - 11);
    const measure = vi.fn();
    await expect(
      captureMaskPng((callback) => callback(value), measure, dimensions),
    ).rejects.toThrow("valid PNG");
    expect(measure).not.toHaveBeenCalled();
  });
  it("rejects a 1×1 export rather than pretending it is full resolution", async () => {
    await expect(
      captureMaskPng(
        (callback) => callback(png),
        async () => ({ width: 1, height: 1 }),
        dimensions,
      ),
    ).rejects.toThrow("dimensions do not match");
  });
  it("handles synchronous native failure and clears its timer", async () => {
    vi.useFakeTimers();
    await expect(
      captureMaskPng(
        () => {
          throw new Error("native");
        },
        vi.fn(),
        dimensions,
      ),
    ).rejects.toThrow("could not prepare");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("times out a missing callback and ignores late native results", async () => {
    vi.useFakeTimers();
    let callback!: (value: string) => void;
    const measure = vi.fn(async () => dimensions);
    const result = captureMaskPng(
      (cb) => {
        callback = cb;
      },
      measure,
      dimensions,
    );
    const rejected = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    callback(png);
    expect(measure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("also bounds a stalled native decoder", async () => {
    vi.useFakeTimers();
    const result = captureMaskPng(
      (callback) => callback(png),
      () => new Promise(() => undefined),
      dimensions,
    );
    const rejected = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
  });
  it("ignores duplicate renderer callbacks", async () => {
    const measure = vi.fn(async () => dimensions);
    await expect(
      captureMaskPng(
        (callback) => {
          callback(png);
          callback("invalid");
        },
        measure,
        dimensions,
      ),
    ).resolves.toBe(png);
    expect(measure).toHaveBeenCalledTimes(1);
  });
});

describe("region exports shared by review and real submission", () => {
  it("preserves the existing API mask shape, original indexes, operation, instruction and bounds", async () => {
    const capture = vi.fn(
      async (kind: string, index: number) => `${kind}:${index}`,
    );
    const result = await exportPaintRegions(
      [{ ...region, strokes: [] }, region],
      false,
      dimensions,
      capture,
    );
    expect(result).toEqual([
      {
        regionIndex: 1,
        instruction: region.instruction,
        operation: "remove",
        bbox: {
          x: 0.25 - 26 / 2048,
          y: 0.5 - 26 / 1365,
          width: 0.5 + 52 / 2048,
          height: expect.closeTo(52 / 1365, 12),
        },
        binary: "binary:1",
        composite: "composite:1",
      },
    ]);
    expect(capture.mock.calls).toEqual([
      ["binary", 1],
      ["composite", 1],
    ]);
  });
  it("does not render an empty selection", async () => {
    const capture = vi.fn();
    await expect(
      exportPaintRegions(
        [{ ...region, strokes: [] }],
        false,
        dimensions,
        capture,
      ),
    ).rejects.toThrow("Paint at least");
    expect(capture).not.toHaveBeenCalled();
  });
  it("ignores a stroke with no coordinates", async () => {
    await expect(
      exportPaintRegions(
        [{ ...region, strokes: [{ size: 20, points: [] }] }],
        false,
        dimensions,
        vi.fn(),
      ),
    ).rejects.toThrow("Paint at least");
  });
  it("requires all custom instructions before exporting any region", async () => {
    const capture = vi.fn();
    await expect(
      exportPaintRegions(
        [region, { ...region, instruction: "  " }],
        true,
        dimensions,
        capture,
      ),
    ).rejects.toThrow("Describe the change");
    expect(capture).not.toHaveBeenCalled();
  });
  it("allows optional instructions for removal", async () => {
    await expect(
      exportPaintRegions(
        [{ ...region, instruction: "" }],
        false,
        dimensions,
        async () => png,
      ),
    ).resolves.toHaveLength(1);
  });
  it("does not return partially prepared regions when one renderer fails", async () => {
    const capture = vi.fn(async (_kind: string, index: number) => {
      if (index === 1) throw new Error("failed");
      return png;
    });
    await expect(
      exportPaintRegions([region, region], false, dimensions, capture),
    ).rejects.toThrow("failed");
    expect(capture).toHaveBeenCalledTimes(3);
  });
  it("caps the number of exported regions", async () => {
    const capture = vi.fn();
    await expect(
      exportPaintRegions(
        Array.from({ length: 9 }, () => region),
        false,
        dimensions,
        capture,
      ),
    ).rejects.toThrow("eight");
    expect(capture).not.toHaveBeenCalled();
  });
});
