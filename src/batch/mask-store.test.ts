import { describe, expect, it, vi } from "vitest";
import { createMaskStore } from "./mask-store";
import type { MaskExport } from "../editor/mask-export";

// Unit encoding fixture; real native PNG pixels are checked in the simulator.
const encoded = "iVBORw0KGgo=";
const mask: MaskExport = {
  regionIndex: 0,
  operation: "remove",
  instruction: "chair",
  bbox: { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
  binary: encoded,
  composite: encoded,
};
function setup() {
  let serial = 0;
  const files: ReturnType<typeof file>[] = [];
  function file() {
    const output = {
      uri: `file:///owned-cache/furnio-batch-mask-${++serial}.png`,
      exists: false,
      create: vi.fn(() => {
        output.exists = true;
      }),
      write: vi.fn((_bytes: Uint8Array) => {}),
      delete: vi.fn(() => {
        output.exists = false;
      }),
    };
    return output;
  }
  const factory = vi.fn(() => {
    const f = file();
    files.push(f);
    return f;
  });
  return { files, factory, store: createMaskStore(factory), validate: vi.fn() };
}
describe("batch mask cache ownership", () => {
  it("keeps each photo's region metadata and separate PNG files", () => {
    const { store, files, validate } = setup();
    const first = store.save("photo-one", [mask], validate);
    const second = store.save(
      "photo-two",
      [{ ...mask, regionIndex: 3 }],
      validate,
    );
    expect(first[0]).toEqual({
      bbox: mask.bbox,
      instruction: "chair",
      operation: "remove",
      regionIndex: 0,
      binaryUri: files[0]!.uri,
      compositeUri: files[1]!.uri,
    });
    expect(second[0]?.regionIndex).toBe(3);
    expect(second[0]?.binaryUri).not.toBe(first[0]?.binaryUri);
    expect(files.every((f) => f.exists)).toBe(true);
    expect(validate).toHaveBeenCalledTimes(2);
  });
  it("replaces only the reviewed photo's old copies after validating the new ones", () => {
    const { store, files, validate } = setup();
    store.save("one", [mask], validate);
    store.save("two", [mask], validate);
    store.save("one", [mask], (prepared) => {
      expect(prepared[0]?.binaryUri).toBe(files[4]!.uri);
      expect(files[0]?.exists).toBe(true);
    });
    expect(files.map((f) => f.exists)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
    store.remove("two");
    expect(files.map((f) => f.exists)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(store.clear()).toBe(0);
    expect(files.every((f) => !f.exists)).toBe(true);
  });
  it("keeps the previous review when replacement validation fails and redacts paths", () => {
    const { store, files, validate } = setup();
    store.save("one", [mask], validate);
    expect(() =>
      store.save("one", [mask], () => {
        throw new Error("private-file-path");
      }),
    ).toThrow("Your previous review is unchanged");
    expect(files.map((f) => f.exists)).toEqual([true, true, false, false]);
    store.clear();
    expect(files.every((f) => !f.exists)).toBe(true);
  });
  it("claims destinations before a partially failing create or write", () => {
    const { store, factory, files, validate } = setup();
    const normal = factory.getMockImplementation()!;
    factory.mockImplementation(() => {
      const f = normal();
      if (files.length === 2)
        f.create.mockImplementation(() => {
          f.exists = true;
          throw new Error("disk full");
        });
      return f;
    });
    expect(() => store.save("one", [mask], validate)).toThrow(
      "could not be prepared",
    );
    expect(files).toHaveLength(2);
    expect(files.every((f) => !f.exists)).toBe(true);
    expect(validate).not.toHaveBeenCalled();
  });
  it("attempts every cleanup, retains failed handles, and prevents accumulation until retry", () => {
    const { store, factory, files, validate } = setup();
    const normal = factory.getMockImplementation()!;
    factory.mockImplementation(() => {
      const f = normal();
      if (files.length === 1)
        f.delete.mockImplementation(() => {
          throw new Error("locked");
        });
      if (files.length === 2)
        f.write.mockImplementation(() => {
          throw new Error("partial write");
        });
      return f;
    });
    expect(() => store.save("one", [mask], validate)).toThrow(
      "could not be prepared",
    );
    expect(files[1]?.exists).toBe(false);
    expect(store.pending).toBe(1);
    expect(() => store.save("two", [mask], validate)).toThrow(
      "Retry temporary-mask cleanup",
    );
    expect(factory).toHaveBeenCalledTimes(2);
    files[0]!.delete.mockImplementation(() => {
      files[0]!.exists = false;
    });
    expect(store.cleanup()).toBe(0);
    store.save("two", [mask], validate);
    expect(factory).toHaveBeenCalledTimes(4);
  });
  it("reports replacement cleanup failure without discarding the valid new review", () => {
    const { store, files, validate } = setup();
    store.save("one", [mask], validate);
    files[0]!.delete.mockImplementation(() => {});
    const next = store.save("one", [mask], validate);
    expect(next[0]?.binaryUri).toBe(files[2]!.uri);
    expect(store.pending).toBe(1);
    expect(files[1]?.exists).toBe(false);
    store.clear();
    expect(files[2]?.exists).toBe(false);
    expect(files[3]?.exists).toBe(false);
    expect(store.pending).toBe(1);
  });
  it("cleans other files if an existence read throws", () => {
    const { store, files, validate } = setup();
    store.save("one", [mask], validate);
    Object.defineProperty(files[0], "exists", {
      get() {
        throw new Error("locked");
      },
    });
    expect(store.clear()).toBe(1);
    expect(files[1]?.exists).toBe(false);
  });
  it("does not overwrite or delete a pre-existing factory destination", () => {
    const { store, factory, files, validate } = setup();
    const normal = factory.getMockImplementation()!;
    factory.mockImplementation(() => {
      const f = normal();
      f.exists = true;
      return f;
    });
    expect(() => store.save("one", [mask], validate)).toThrow(
      "could not be prepared",
    );
    expect(files[0]?.create).not.toHaveBeenCalled();
    expect(files[0]?.delete).not.toHaveBeenCalled();
    expect(store.clear()).toBe(0);
  });
  it("does not remove another photo or an arbitrary caller-supplied URI", () => {
    const { store, files, validate } = setup();
    const data = store.save("one", [mask], validate);
    data[0]!.binaryUri = "file:///private-original.jpg";
    store.remove("file:///private-original.jpg");
    expect(files.every((f) => f.exists)).toBe(true);
    store.clear();
    expect(files.every((f) => !f.exists)).toBe(true);
  });
  it.each([{ masks: [] }, { masks: Array.from({ length: 9 }, () => mask) }])(
    "rejects an invalid region count before writing",
    ({ masks }) => {
      const { store, factory, validate } = setup();
      expect(() => store.save("one", masks, validate)).toThrow("one and eight");
      expect(factory).not.toHaveBeenCalled();
    },
  );
  it("validates all payloads before allocating files", () => {
    const { store, factory, validate } = setup();
    expect(() =>
      store.save(
        "one",
        [mask, { ...mask, composite: "https://private.invalid/photo" }],
        validate,
      ),
    ).toThrow("not a valid PNG");
    expect(factory).not.toHaveBeenCalled();
  });
});
