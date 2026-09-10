import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertCapturedPhoto,
  createDisclosureCapture,
  prepareDisclosureJpeg,
  validatedDisclosure,
} from "./disclosure-export";
import {
  defaultDisclosure,
  fitDisclosureScale,
  placement,
} from "./disclosure-settings";

const dimensions = { width: 4032, height: 3024 };

it("ignores hidden invalid label fields only when the disclosure is explicitly off", () => {
  const input = {
    ...defaultDisclosure,
    enabled: false,
    text: "x".repeat(81),
    color: "#ff",
    position: "unsupported",
  };
  expect(validatedDisclosure(input)).toEqual({
    ...defaultDisclosure,
    enabled: false,
  });
  expect(input.color).toBe("#ff");
  expect(() => validatedDisclosure({ ...input, enabled: true })).toThrow(
    "80 characters",
  );
  expect(() => validatedDisclosure({ ...input, enabled: "false" })).toThrow();
  expect(() => validatedDisclosure(null)).toThrow();
});
// Header fixture only: adapter checks do not certify real native PNG decoding.
function png(width = dimensions.width, height = dimensions.height) {
  const header = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(header);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header.toString("base64");
}
function capture() {
  const controller = new AbortController();
  let callback!: (data: string) => void;
  let tick!: () => void;
  const cancel = vi.fn();
  const frame = vi.fn((work: () => void) => {
    tick = work;
    return cancel;
  });
  const render = vi.fn((done: (data: string) => void) => {
    callback = done;
  });
  const request = createDisclosureCapture({
    dimensions,
    signal: controller.signal,
    frame,
    render,
  });
  return {
    request,
    controller,
    frame,
    render,
    cancel,
    tick: () => tick(),
    callback: (data: string) => callback(data),
  };
}
afterEach(() => vi.useRealTimers());

describe("disclosure capture lifecycle", () => {
  it("waits for both photo load and fitted text, then waits one frame", async () => {
    vi.useFakeTimers();
    const c = capture();
    c.request.ready("image");
    c.request.ready("image");
    expect(c.frame).not.toHaveBeenCalled();
    c.request.ready("text");
    expect(c.frame).toHaveBeenCalledTimes(1);
    expect(c.render).not.toHaveBeenCalled();
    c.tick();
    c.callback(png());
    await expect(c.request.promise).resolves.toBe(png());
    expect(c.render).toHaveBeenCalledWith(expect.any(Function), dimensions);
    expect(c.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("also accepts text readiness before photo load", async () => {
    const c = capture();
    c.request.ready("text");
    c.request.ready("image");
    c.tick();
    c.callback(png());
    await expect(c.request.promise).resolves.toBe(png());
  });
  it("ignores duplicate readiness and native callbacks", async () => {
    const c = capture();
    c.request.ready("text");
    c.request.ready("image");
    c.tick();
    c.callback(png());
    c.callback("bad");
    c.request.ready("image");
    c.request.fail();
    await expect(c.request.promise).resolves.toBe(png());
    expect(c.render).toHaveBeenCalledOnce();
  });
  it("cancels an unmounted request before its scheduled frame", async () => {
    vi.useFakeTimers();
    const c = capture();
    c.request.ready("text");
    c.request.ready("image");
    c.controller.abort();
    c.tick();
    await expect(c.request.promise).rejects.toThrow("cancelled");
    expect(c.render).not.toHaveBeenCalled();
    expect(c.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ignores native completion after unmount", async () => {
    const c = capture();
    c.request.ready("text");
    c.request.ready("image");
    c.tick();
    c.controller.abort();
    c.callback(png());
    await expect(c.request.promise).rejects.toThrow("cancelled");
  });
  it.each(["image", "text", "render"])(
    "times out a missing %s and releases the timer",
    async (missing) => {
      vi.useFakeTimers();
      const c = capture();
      if (missing !== "image") c.request.ready("image");
      if (missing !== "text") c.request.ready("text");
      if (missing === "render") c.tick();
      const rejected = expect(c.request.promise).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(15_000);
      await rejected;
      c.request.ready("image");
      c.request.ready("text");
      if (missing === "render") c.callback(png());
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("old image/text callbacks cannot start a replacement request", async () => {
    const old = capture();
    old.controller.abort();
    await expect(old.request.promise).rejects.toThrow("cancelled");
    const next = capture();
    old.request.ready("image");
    old.request.ready("text");
    expect(next.frame).not.toHaveBeenCalled();
    expect(old.frame).not.toHaveBeenCalled();
    next.request.ready("image");
    next.request.ready("text");
    next.tick();
    next.callback(png());
    await expect(next.request.promise).resolves.toBe(png());
  });
  it.each(["frame", "render"])(
    "contains a synchronous %s failure without leaking native paths",
    async (which) => {
      vi.useFakeTimers();
      const fail = () => {
        throw new Error("file:///private/photo.png");
      };
      const request = createDisclosureCapture({
        dimensions,
        signal: new AbortController().signal,
        frame:
          which === "frame"
            ? fail
            : (work) => {
                work();
                return vi.fn();
              },
        render: fail,
      });
      request.ready("image");
      request.ready("text");
      await expect(request.promise).rejects.toThrow(
        "The photo renderer could not prepare this image.",
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("fails measured-text readiness and clears its wait", async () => {
    vi.useFakeTimers();
    const c = capture();
    c.request.fail();
    await expect(c.request.promise).rejects.toThrow("could not be measured");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does no work if already aborted", async () => {
    const signal = AbortSignal.abort();
    const frame = vi.fn();
    const c = createDisclosureCapture({
      dimensions,
      signal,
      frame,
      render: vi.fn(),
    });
    c.ready("text");
    c.ready("image");
    await expect(c.promise).rejects.toThrow("cancelled");
    expect(frame).not.toHaveBeenCalled();
  });
  it("rejects invalid dimensions before rendering", async () => {
    const frame = vi.fn();
    const c = createDisclosureCapture({
      dimensions: { width: NaN, height: 1 },
      signal: new AbortController().signal,
      frame,
      render: vi.fn(),
    });
    c.ready("image");
    c.ready("text");
    await expect(c.promise).rejects.toThrow("dimensions");
    expect(frame).not.toHaveBeenCalled();
  });
  it("passes only dimensions to the native bridge, not the prepared base64 photo", async () => {
    const render = vi.fn((done: (data: string) => void) => done(png()));
    const prepared = {
      ...dimensions,
      base64: "private-data",
      uri: "file:///photo.jpg",
    };
    const c = createDisclosureCapture({
      dimensions: prepared,
      signal: new AbortController().signal,
      frame: (work) => {
        work();
        return vi.fn();
      },
      render,
    });
    c.ready("image");
    c.ready("text");
    await c.promise;
    expect(render).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      dimensions,
    );
  });
});

describe("resolution and PNG envelope", () => {
  it("accepts the exact full-resolution header", () =>
    expect(() => assertCapturedPhoto(png(), dimensions)).not.toThrow());
  it.each([
    [1, 1],
    [12096, 9072],
    [4032, 1],
  ])("rejects resized native PNG %sx%s", (w, h) =>
    expect(() => assertCapturedPhoto(png(w, h), dimensions)).toThrow(
      "lost resolution",
    ),
  );
  it.each([
    "",
    "https://invalid.example/photo",
    "A".repeat(44),
    "%".repeat(44),
    "iVBORw0KGgoAAAANSUhEUg==",
  ])("rejects malformed or truncated data", (data) =>
    expect(() => assertCapturedPhoto(data, dimensions)).toThrow(
      "invalid image",
    ),
  );
  it("bounds encoded bytes relative to requested pixels", () =>
    expect(() =>
      assertCapturedPhoto(png(1, 1) + "A".repeat(2 * 1024 * 1024), {
        width: 1,
        height: 1,
      }),
    ).toThrow("invalid image"));
});

describe("native image references and cancelled writes", () => {
  function setup() {
    const signal = new AbortController();
    const own = vi.fn();
    const saved = {
      ...dimensions,
      uri: "file:///generated.jpg",
      base64: "image",
    };
    const image = {
      ...dimensions,
      saveAsync: vi.fn(async () => saved),
      release: vi.fn(),
    };
    const context = { renderAsync: vi.fn(async () => image), release: vi.fn() };
    const create = vi.fn(() => context);
    const run = (base64 = true) =>
      prepareDisclosureJpeg(create, own, signal.signal, {
        compress: 1,
        base64,
        expected: dimensions,
      });
    return { signal, own, saved, image, context, create, run };
  }
  it("registers a new copy and releases both native refs", async () => {
    const s = setup();
    await expect(s.run()).resolves.toEqual(s.saved);
    expect(s.own).toHaveBeenCalledWith(s.saved.uri);
    expect(s.image.release).toHaveBeenCalledOnce();
    expect(s.context.release).toHaveBeenCalledOnce();
  });
  it("does not request base64 for no-label export", async () => {
    const s = setup();
    await s.run(false);
    expect(s.image.saveAsync).toHaveBeenCalledWith({
      compress: 1,
      base64: false,
    });
  });
  it("rejects incorrect dimensions after registering the generated file for cleanup", async () => {
    const s = setup();
    s.saved.width = 1;
    await expect(s.run()).rejects.toThrow("lost resolution");
    expect(s.own).toHaveBeenCalledWith(s.saved.uri);
    expect(s.image.release).toHaveBeenCalledOnce();
  });
  it("rejects a missing requested base64 representation", async () => {
    const s = setup();
    s.saved.base64 = "";
    await expect(s.run()).rejects.toThrow("could not be prepared");
    expect(s.own).toHaveBeenCalled();
  });
  it("rejects a resized native decode before writing the final JPEG", async () => {
    const s = setup();
    s.image.width = 1;
    await expect(s.run()).rejects.toThrow("lost resolution");
    expect(s.image.saveAsync).not.toHaveBeenCalled();
    expect(s.image.release).toHaveBeenCalledOnce();
  });
  it("avoids all native work when already cancelled", async () => {
    const s = setup();
    s.signal.abort();
    await expect(s.run()).rejects.toThrow("cancelled");
    expect(s.create).not.toHaveBeenCalled();
  });
  it("does not start a write after cancellation during native rendering", async () => {
    const s = setup();
    s.context.renderAsync.mockImplementation(async () => {
      s.signal.abort();
      return s.image;
    });
    await expect(s.run()).rejects.toThrow("cancelled");
    expect(s.image.saveAsync).not.toHaveBeenCalled();
    expect(s.image.release).toHaveBeenCalledOnce();
    expect(s.context.release).toHaveBeenCalledOnce();
  });
  it("waits for an in-flight write before releasing memory, then owns its late file", async () => {
    const s = setup();
    let finish!: () => void;
    s.image.saveAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(s.saved);
        }),
    );
    const pending = s.run();
    await Promise.resolve();
    s.signal.abort();
    expect(s.image.release).not.toHaveBeenCalled();
    expect(s.context.release).not.toHaveBeenCalled();
    const rejected = expect(pending).rejects.toThrow("cancelled");
    finish();
    await rejected;
    expect(s.own).toHaveBeenCalledWith(s.saved.uri);
    expect(s.image.release).toHaveBeenCalledOnce();
    expect(s.context.release).toHaveBeenCalledOnce();
  });
  it("releases the context on decode failure", async () => {
    const s = setup();
    s.context.renderAsync.mockRejectedValue(new Error("decode"));
    await expect(s.run()).rejects.toThrow("decode");
    expect(s.context.release).toHaveBeenCalledOnce();
    expect(s.image.release).not.toHaveBeenCalled();
  });
  it("does not replace a write failure or skip context release if image release throws", async () => {
    const s = setup();
    s.image.saveAsync.mockRejectedValue(new Error("write"));
    s.image.release.mockImplementation(() => {
      throw Error("release");
    });
    await expect(s.run()).rejects.toThrow("write");
    expect(s.context.release).toHaveBeenCalledOnce();
  });
});

describe("measured disclosure fitting", () => {
  it("accepts and trims a supported disclosure", () =>
    expect(
      validatedDisclosure({
        ...defaultDisclosure,
        text: "  Virtually Staged  ",
      }),
    ).toEqual(defaultDisclosure));
  it("explains the 80-character limit without echoing the input", () =>
    expect(() =>
      validatedDisclosure({ ...defaultDisclosure, text: "W".repeat(81) }),
    ).toThrow("Use no more than 80 characters"));
  it("accepts exactly 80 characters", () =>
    expect(
      validatedDisclosure({ ...defaultDisclosure, text: "W".repeat(80) }).text,
    ).toHaveLength(80));
  it("explains an incomplete hex color", () =>
    expect(() =>
      validatedDisclosure({ ...defaultDisclosure, color: "#ff" }),
    ).toThrow("six-digit label color"));
  it("explains invalid controls without exposing their contents", () =>
    expect(() =>
      validatedDisclosure({ ...defaultDisclosure, fontSize: Infinity }),
    ).toThrow("Choose a supported disclosure"));
  it("leaves short text at the chosen size", () =>
    expect(fitDisclosureScale(4032, 3024, 100, 50)).toBe(1));
  it("shrinks a long label to 82 percent of image width", () =>
    expect(fitDisclosureScale(1000, 600, 1640, 50)).toBeCloseTo(0.5));
  it("also protects unusually short images", () =>
    expect(fitDisclosureScale(1000, 50, 100, 100)).toBeCloseTo(0.4));
  it.each([0, NaN, Infinity, -1])("rejects unusable measurements %s", (size) =>
    expect(() => fitDisclosureScale(1000, 600, size, 50)).toThrow("measured"),
  );
  it("repositions a top label after shrinking while retaining bottom placement", () => {
    const top = { ...defaultDisclosure, position: "top-left" as const };
    const original = placement(top, 2048, 1000);
    const fitted = placement(top, 2048, 1000, 0.5);
    expect(fitted.y).toBe(original.y - original.size / 2);
    expect(fitted.size).toBe(original.size / 2);
    expect(placement(defaultDisclosure, 2048, 1000, 0.5).y).toBe(
      placement(defaultDisclosure, 2048, 1000).y,
    );
  });
  it("uses the same 12px starting minimum as the website", () =>
    expect(
      placement({ ...defaultDisclosure, fontSize: 14 }, 640, 480).size,
    ).toBe(12));
});
