import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  files: new Set<string>(),
  dirs: new Set<string>(),
  denied: new Set<string>(),
  silent: new Set<string>(),
  markerFailure: false,
  creationFailure: false,
  serial: 0,
  cache: "file:///current-container/Library/Caches",
  platform: "ios",
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return state.platform;
    },
  },
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () =>
    `12345678-1234-1234-1234-${String(++state.serial).padStart(12, "0")}`,
}));
vi.mock("expo-file-system", () => {
  const uri = (parts: (string | { uri: string })[]) =>
    parts
      .map((part) =>
        (typeof part === "string" ? part : part.uri).replace(/\/$/, ""),
      )
      .join("/");
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = uri(parts);
    }
    get name() {
      return this.uri.split("/").at(-1)!;
    }
    get exists() {
      return state.files.has(this.uri);
    }
    create() {
      if (state.markerFailure || this.exists)
        throw new Error("private path: denied");
      state.files.add(this.uri);
    }
    delete() {
      if (state.denied.has(this.uri)) throw new Error("private path: denied");
      if (!state.silent.has(this.uri)) state.files.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = uri(parts);
    }
    get name() {
      return this.uri.split("/").at(-1)!;
    }
    get exists() {
      return state.dirs.has(this.uri);
    }
    create() {
      if (state.creationFailure || this.exists)
        throw new Error("private path: collision");
      state.dirs.add(this.uri);
      state.dirs.add(this.uri.slice(0, this.uri.lastIndexOf("/")));
    }
    list() {
      const child = (path: string) =>
        path.startsWith(this.uri + "/") &&
        !path.slice(this.uri.length + 1).includes("/");
      return [
        ...[...state.files].filter(child).map((path) => new File(path)),
        ...[...state.dirs].filter(child).map((path) => new Directory(path)),
      ];
    }
    delete() {
      if (this.list().length)
        throw new Error("recursive deletion prohibited by test");
      if (state.denied.has(this.uri)) throw new Error("private path: denied");
      state.dirs.delete(this.uri);
    }
  }
  return {
    Directory,
    File,
    Paths: {
      get cache() {
        return new Directory(state.cache);
      },
    },
  };
});
const load = () => import("./native-export-session");
const sdkName = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA.jpg";
const pause = () => {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
};
beforeEach(() => {
  vi.resetModules();
  state.files.clear();
  state.dirs.clear();
  state.denied.clear();
  state.silent.clear();
  state.markerFailure = false;
  state.creationFailure = false;
  state.serial = 0;
  state.platform = "ios";
});

describe("native export lifecycle wiring", () => {
  it("cleans allocated destinations and SDK copies, preserving original/draft/cache files", async () => {
    const native = await load(),
      { File } = await import("expo-file-system"),
      session = native.createNativeExportSession();
    const originals = [
      `${state.cache}/ImagePicker/original.jpg`,
      `${state.cache}/furnio-drafts-v2/original.jpg`,
      `${state.cache}/ImageManipulator/BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB.jpg`,
    ];
    originals.forEach((path) => state.files.add(path));
    await session.run(async (own) => {
      const output = own(session.allocate("final"));
      output.create();
      const sdk = new File(state.cache, "ImageManipulator", sdkName);
      sdk.create();
      own(sdk);
      expect(
        [...state.files].some((path) => path.endsWith(`sdk-${sdkName}.owned`)),
      ).toBe(true);
      expect(native.recoverNativeExports().failed).toBe(0);
      expect(output.exists).toBe(true);
    });
    expect([...state.files]).toEqual(originals);
    expect(session.pending).toBe(0);
    expect(
      [...state.dirs].filter((path) =>
        path.includes("furnio-result-exports-v1/"),
      ),
    ).toEqual([]);
  });
  it("reclaims an allocated partial write even if it was never registered in memory", async () => {
    const native = await load(),
      session = native.createNativeExportSession();
    const failure = new Error("native export failed");
    await expect(
      session.run(async () => {
        session.allocate("source").create();
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(state.files.size).toBe(0);
    expect(session.active).toBe(false);
  });
  it("keeps files and ownership during foreground/repeated run while sharing", async () => {
    const native = await load(),
      session = native.createNativeExportSession(),
      waiting = pause();
    const run = session.run(async (own) => {
      own(session.allocate("final")).create();
      const close = session.beginShare();
      await waiting.promise;
      close();
    });
    expect(await session.run(vi.fn())).toBe(false);
    session.cleanup();
    native.recoverNativeExports();
    expect(session.active).toBe(true);
    expect(state.files.size).toBe(2);
    waiting.finish();
    await run;
    expect(state.files.size).toBe(0);
    expect(session.pending).toBe(0);
  });
  it("keeps separate export sessions isolated", async () => {
    const native = await load(),
      first = native.createNativeExportSession(),
      second = native.createNativeExportSession(),
      waiting = pause();
    const run = first.run(async (own) => {
      own(first.allocate("final")).create();
      await waiting.promise;
    });
    const firstFiles = [...state.files];
    await second.run(async (own) => {
      own(second.allocate("final")).create();
    });
    expect([...state.files]).toEqual(firstFiles);
    waiting.finish();
    await run;
    expect(state.files.size).toBe(0);
  });
  it.each([
    "ImagePicker/original.jpg",
    "furnio-drafts-v2/original.jpg",
    "ImageManipulator/original.jpg",
    "../Documents/original.jpg",
  ])("rejects ownership of %s without deleting it", async (path) => {
    const native = await load(),
      { File } = await import("expo-file-system"),
      session = native.createNativeExportSession();
    const original = new File(state.cache, path);
    original.create();
    await expect(
      session.run(async (own) => {
        own(original);
      }),
    ).rejects.toThrow("Temporary photo cleanup");
    expect(original.exists).toBe(true);
  });
  it("rejects an unallocated filename inside the session", async () => {
    const native = await load(),
      { File } = await import("expo-file-system"),
      session = native.createNativeExportSession();
    await expect(
      session.run(async (own) => {
        const allocated = session.allocate("source");
        const foreign = new File(
          allocated.uri.replace(/source-[^/]+$/, "notes.txt"),
        );
        foreign.create();
        own(foreign);
      }),
    ).rejects.toThrow("Temporary photo cleanup");
    expect([...state.files].some((path) => path.endsWith("notes.txt"))).toBe(
      true,
    );
    expect(native.exportRecoverySnapshot().failed).toBe(1);
  });
  it("redacts session-directory failures", async () => {
    const native = await load(),
      session = native.createNativeExportSession();
    state.creationFailure = true;
    await expect(session.run(vi.fn())).rejects.toThrow(
      "Originals, saved drafts and cloud work are unchanged",
    );
    expect(session.active).toBe(false);
  });
  it("cleans the SDK handle when persistent ownership registration fails", async () => {
    const native = await load(),
      { File } = await import("expo-file-system"),
      session = native.createNativeExportSession();
    await expect(
      session.run(async (own) => {
        const sdk = new File(state.cache, "ImageManipulator", sdkName);
        sdk.create();
        state.markerFailure = true;
        own(sdk);
      }),
    ).rejects.toThrow("Temporary photo cleanup");
    expect(state.files.size).toBe(0);
    expect(session.pending).toBe(0);
  });
  it("does not launch sharing unless the hold is persisted", async () => {
    const native = await load(),
      session = native.createNativeExportSession(),
      share = vi.fn();
    await expect(
      session.run(async (own) => {
        own(session.allocate("final")).create();
        state.markerFailure = true;
        session.beginShare();
        share();
      }),
    ).rejects.toThrow("Temporary photo cleanup");
    expect(share).not.toHaveBeenCalled();
    expect(state.files.size).toBe(0);
  });
  it.each(["denied", "silent"] as const)(
    "retains %s deletion failures, blocks accumulation, and retries",
    async (failure) => {
      const native = await load(),
        session = native.createNativeExportSession();
      await session.run(async (own) => {
        const file = own(session.allocate("final"));
        file.create();
        state[failure].add(file.uri);
      });
      expect(session.pending).toBeGreaterThan(0);
      expect(native.exportRecoverySnapshot().failed).toBe(1);
      await expect(
        native.createNativeExportSession().run(vi.fn()),
      ).rejects.toThrow("Temporary photo cleanup");
      state[failure].clear();
      expect(session.cleanup()).toBe(0);
      expect(state.files.size).toBe(0);
    },
  );
  it("notifies only when recovery state changes and supports unsubscribe", async () => {
    const native = await load(),
      { Directory } = await import("expo-file-system"),
      listener = vi.fn();
    new Directory(state.cache, "furnio-result-exports-v1", "unknown").create();
    const stop = native.subscribeExportRecovery(listener);
    native.recoverNativeExports();
    native.recoverNativeExports();
    expect(listener).toHaveBeenCalledTimes(1);
    state.dirs.delete(`${state.cache}/furnio-result-exports-v1/unknown`);
    native.recoverNativeExports();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    expect(native.exportRecoverySnapshot().failed).toBe(0);
  });
  it("does not inspect native storage during web startup", async () => {
    const native = await load();
    state.platform = "web";
    state.dirs.add(`${state.cache}/furnio-result-exports-v1`);
    state.files.add(`${state.cache}/furnio-result-exports-v1/unknown`);
    expect(native.recoverNativeExports()).toEqual({
      failed: 0,
      retainedShares: 0,
    });
    expect(state.files.size).toBe(1);
  });
});
