import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  files: new Map<string, number>(),
  dirs: new Set<string>(),
  denied: new Set<string>(),
  serial: 0,
  platform: "ios",
  cache: "file:///current/cache",
  copyFails: false,
  copyWait: undefined as Promise<void> | undefined,
  picker: vi.fn(),
  camera: vi.fn(),
  permission: vi.fn(),
  document: vi.fn(),
  render: vi.fn(),
  save: vi.fn(),
  contextRelease: vi.fn(),
  imageRelease: vi.fn(),
  read: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return state.platform;
    },
  },
}));
vi.mock("../state", () => ({
  api: vi.fn(() => {
    throw Error("No API permitted");
  }),
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () =>
    `aaaaaaaa-aaaa-4aaa-8aaa-${String(++state.serial).padStart(12, "0")}`,
}));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: state.picker,
  launchCameraAsync: state.camera,
  requestCameraPermissionsAsync: state.permission,
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: state.document }));
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      renderAsync: state.render,
      release: state.contextRelease,
    }),
  },
}));
vi.mock("expo-file-system", () => {
  const uri = (parts: (string | { uri: string })[]) =>
    parts
      .map((part) =>
        (typeof part === "string" ? part : part.uri).replace(/\/$/, ""),
      )
      .filter(Boolean)
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
    get size() {
      return state.files.get(this.uri) ?? 0;
    }
    arrayBuffer() {
      state.read();
      return Promise.resolve(new ArrayBuffer(this.size));
    }
    create() {
      if (this.exists) throw Error("collision");
      state.files.set(this.uri, 0);
    }
    delete() {
      if (state.denied.has(this.uri)) throw Error("private file path");
      state.files.delete(this.uri);
    }
    async copy(target: File) {
      // Match the installed SDK's AsyncFunction rather than a synchronous fake.
      await state.copyWait;
      if (!this.exists || target.exists) throw Error("invalid copy");
      state.files.set(target.uri, this.size);
      if (state.copyFails) throw Error("interrupted copy");
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
      if (this.exists) throw Error("collision");
      state.dirs.add(this.uri);
      state.dirs.add(this.uri.slice(0, this.uri.lastIndexOf("/")));
    }
    list() {
      const child = (path: string) =>
        path.startsWith(this.uri + "/") &&
        !path.slice(this.uri.length + 1).includes("/");
      return [
        ...[...state.files.keys()].filter(child).map((path) => new File(path)),
        ...[...state.dirs].filter(child).map((path) => new Directory(path)),
      ];
    }
    delete() {
      if (this.list().length) throw Error("no recursive deletes");
      state.dirs.delete(this.uri);
    }
  }
  return {
    File,
    Directory,
    Paths: {
      get cache() {
        return new Directory(state.cache);
      },
    },
  };
});
const id = (n: number) =>
  `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`;
function file(folder: string, name: string, bytes = 600) {
  const uri = `${state.cache}/${folder ? folder + "/" : ""}${name}`;
  state.files.set(uri, bytes);
  if (folder) state.dirs.add(`${state.cache}/${folder}`);
  return uri;
}
const asset = (n = 1) => ({
  uri: file("ImagePicker", `${id(n)}.HEIC`),
  fileName: "customer-home.heic",
});
function delayed<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function setup() {
  const native = await import("./native-inputs"),
    media = await import("../media");
  const controller = new AbortController(),
    owner = native.createNativeInputOwner(controller.signal, () => {});
  return {
    ...native,
    media,
    controller,
    owner,
    choose: (limit = 1) => owner.run((tx) => media.choosePhotos(tx, limit)),
    document: () => owner.run((tx) => media.chooseFloorplan(tx)),
  };
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.files.clear();
  state.dirs.clear();
  state.denied.clear();
  state.serial = 0;
  state.platform = "ios";
  state.copyFails = false;
  state.copyWait = undefined;
  state.permission.mockResolvedValue({ granted: true });
  state.picker.mockResolvedValue({ canceled: true });
  state.camera.mockResolvedValue({ canceled: true });
  state.document.mockResolvedValue({ canceled: true });
  state.render.mockImplementation(async () => ({
    saveAsync: state.save,
    release: state.imageRelease,
  }));
  state.save.mockImplementation(async () => ({
    uri: file("ImageManipulator", `${id(100 + ++state.serial)}.jpg`, 800),
    width: 4032,
    height: 3024,
  }));
});
describe("real picker adapter with isolated native file-system mocks", () => {
  it("keeps SDK and lease ownership until asynchronous copying settles", async () => {
    const s = await setup(),
      wait = delayed<void>();
    state.copyWait = wait.promise;
    state.picker.mockResolvedValue({ canceled: false, assets: [asset()] });
    const result = s.choose();
    let returned = false;
    void result.then(() => {
      returned = true;
    });
    await vi.waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    expect(returned).toBe(false);
    expect(
      [...state.files.keys()].some((uri) => uri.includes("ImageManipulator/")),
    ).toBe(true);
    s.recoverNativeInputs();
    wait.resolve();
    const [photo] = await result;
    expect(state.files.has(photo!.uri)).toBe(true);
    s.owner.close();
    expect(state.files.size).toBe(0);
  });
  it("waits for a late copy after abort, then reclaims its completed destination", async () => {
    const s = await setup(),
      wait = delayed<void>();
    state.copyWait = wait.promise;
    state.picker.mockResolvedValue({ canceled: false, assets: [asset()] });
    const result = s.choose();
    const check = expect(result).rejects.toThrow();
    await vi.waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    s.controller.abort();
    wait.resolve();
    await check;
    expect(state.files.size).toBe(0);
  });
  it("normalizes full-resolution JPEGs, removes SDK duplicates and retains only editor-owned copies", async () => {
    const s = await setup(),
      original = file("Photos", "original.heic"),
      draft = file("furnio-drafts-v2", "saved.jpg");
    state.picker.mockResolvedValue({ canceled: false, assets: [asset()] });
    const [photo] = await s.choose();
    expect(photo).toMatchObject({
      contentType: "image/jpeg",
      name: "customer-home.jpg",
      width: 4032,
      height: 3024,
      bytes: 800,
    });
    expect(photo!.uri).toContain("/furnio-photo-inputs-v1/");
    expect([...state.files.keys()].sort()).toEqual(
      [original, draft, photo!.uri].sort(),
    );
    expect(state.imageRelease).toHaveBeenCalledOnce();
    expect(state.contextRelease).toHaveBeenCalledOnce();
    expect(state.read).not.toHaveBeenCalled();
    s.recoverNativeInputs();
    expect(state.files.has(photo!.uri)).toBe(true);
    s.controller.abort();
    expect([...state.files.keys()].sort()).toEqual([original, draft].sort());
  });
  it("keeps a private PDF copy and verifies its actual native size", async () => {
    const s = await setup(),
      uri = file("DocumentPicker", `${id(1)}.pdf`, 700);
    state.document.mockResolvedValue({
      canceled: false,
      assets: [
        { uri, size: 1, name: "floor-plan.pdf", mimeType: "application/pdf" },
      ],
    });
    const [photo] = await s.document();
    expect(photo).toMatchObject({
      bytes: 700,
      contentType: "application/pdf",
      width: 1,
      height: 1,
    });
    expect(state.files.has(uri)).toBe(false);
    expect(state.render).not.toHaveBeenCalled();
    s.owner.close();
    expect(state.files.size).toBe(0);
  });
  it("revalidates a normalized floor-plan JPEG instead of trusting its source size", async () => {
    const s = await setup(),
      uri = file("DocumentPicker", `${id(1)}.jpeg`);
    state.document.mockResolvedValue({
      canceled: false,
      assets: [{ uri, size: 1, name: "plan.jpeg", mimeType: "image/jpeg" }],
    });
    const [photo] = await s.document();
    expect(photo?.bytes).toBe(800);
    expect(photo?.name).toBe("plan.jpg");
    s.owner.close();
    expect(state.files.size).toBe(0);
  });
  it.each([0, -1, NaN, Infinity, 20 * 1024 * 1024 + 1])(
    "rejects an invalid source size without allocating its bytes: %s",
    async (bytes) => {
      const s = await setup(),
        item = asset();
      state.files.set(item.uri, bytes);
      state.picker.mockResolvedValue({ canceled: false, assets: [item] });
      await expect(s.choose()).rejects.toThrow("20 MB");
      expect(state.read).not.toHaveBeenCalled();
      expect(state.render).not.toHaveBeenCalled();
      expect(state.files.size).toBe(0);
    },
  );
  it("cleans all selected files and earlier outputs when a later conversion fails", async () => {
    const s = await setup();
    state.picker.mockResolvedValue({
      canceled: false,
      assets: [asset(1), asset(2), asset(3)],
    });
    state.render
      .mockImplementationOnce(async () => ({
        saveAsync: state.save,
        release: state.imageRelease,
      }))
      .mockRejectedValueOnce(Error("bad image"));
    await expect(s.choose(3)).rejects.toThrow("bad image");
    expect(state.files.size).toBe(0);
    expect(state.imageRelease).toHaveBeenCalledOnce();
    expect(state.contextRelease).toHaveBeenCalledTimes(2);
  });
  it("cleans normalized files exceeding the limit and releases native handles", async () => {
    const s = await setup();
    state.picker.mockResolvedValue({ canceled: false, assets: [asset()] });
    state.save.mockImplementationOnce(async () => ({
      uri: file("ImageManipulator", `${id(9)}.jpg`, 30_000_000),
      width: 1,
      height: 1,
    }));
    await expect(s.choose()).rejects.toThrow("20 MB");
    expect(state.files.size).toBe(0);
    expect(state.imageRelease).toHaveBeenCalledOnce();
    expect(state.contextRelease).toHaveBeenCalledOnce();
  });
  it("removes excess SDK selections rather than silently orphaning them", async () => {
    const s = await setup();
    state.picker.mockResolvedValue({
      canceled: false,
      assets: [asset(1), asset(2)],
    });
    expect(await s.choose(1)).toHaveLength(1);
    expect(state.files.size).toBe(1);
    s.owner.close();
    expect(state.files.size).toBe(0);
  });
  it("collects late picker results after sign-out before any conversion or UI result", async () => {
    const s = await setup(),
      wait = delayed<unknown>();
    state.picker.mockReturnValueOnce(wait.promise);
    const result = s.choose();
    const check = expect(result).rejects.toThrow("sign-in changed");
    s.controller.abort();
    wait.resolve({ canceled: false, assets: [asset()] });
    await check;
    expect(state.render).not.toHaveBeenCalled();
    expect(state.files.size).toBe(0);
  });
  it("collects a late saved JPEG after closing the editor", async () => {
    const s = await setup(),
      wait = delayed<unknown>();
    state.picker.mockResolvedValue({ canceled: false, assets: [asset()] });
    state.save.mockReturnValueOnce(wait.promise);
    const result = s.choose();
    const check = expect(result).rejects.toThrow("sign-in changed");
    await vi.waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    s.owner.close();
    s.recoverNativeInputs(); // in-flight source is still required by the SDK
    wait.resolve({
      uri: file("ImageManipulator", `${id(9)}.jpg`),
      width: 10,
      height: 10,
    });
    await check;
    expect(state.files.size).toBe(0);
    expect(state.imageRelease).toHaveBeenCalledOnce();
  });
  it("never deletes an external original when a picker returns an unsupported URI", async () => {
    const s = await setup(),
      original = file("Photos", "original.jpg");
    state.picker.mockResolvedValue({
      canceled: false,
      assets: [{ uri: original }, asset(2)],
    });
    await expect(s.choose(2)).rejects.toThrow("unsupported temporary location");
    expect([...state.files.keys()]).toEqual([original]);
    expect(state.render).not.toHaveBeenCalled();
  });
  it("retains a failed SDK cleanup marker and exposes retry without removing unrelated files", async () => {
    const s = await setup(),
      item = asset(),
      original = file("Photos", "original.jpg");
    state.denied.add(item.uri);
    state.picker.mockResolvedValue({ canceled: false, assets: [item] });
    await expect(s.choose()).rejects.toThrow("cleanup needs attention");
    expect(s.inputRecoverySnapshot().failed).toBeGreaterThan(0);
    expect([...state.files.keys()].some((uri) => uri.endsWith(".owned"))).toBe(
      true,
    );
    state.denied.clear();
    expect(s.recoverNativeInputs().failed).toBe(0);
    expect([...state.files.keys()]).toEqual([original]);
  });
  it("collects partially copied output after an interrupted native copy", async () => {
    const s = await setup();
    state.copyFails = true;
    state.picker.mockResolvedValue({ canceled: false, assets: [asset()] });
    await expect(s.choose()).rejects.toThrow("cleanup needs attention");
    expect(state.files.size).toBe(0);
  });
  it("recovers returned editing files on a fresh process", async () => {
    const s = await setup();
    state.picker.mockResolvedValue({ canceled: false, assets: [asset()] });
    await s.choose();
    expect(state.files.size).toBe(1);
    vi.resetModules();
    const restarted = await import("./native-inputs");
    expect(restarted.recoverNativeInputs().failed).toBe(0);
    expect(state.files.size).toBe(0);
  });
  it("rejects overlapping selection without cancelling the original", async () => {
    const s = await setup(),
      wait = delayed<unknown>();
    state.picker.mockReturnValueOnce(wait.promise);
    const first = s.choose();
    await expect(s.choose()).rejects.toThrow("Finish the current");
    wait.resolve({ canceled: false, assets: [asset()] });
    expect(await first).toHaveLength(1);
    s.owner.close();
    expect(state.files.size).toBe(0);
  });
  it("does not launch a picker after its owner is closed", async () => {
    const s = await setup();
    s.owner.close();
    await expect(s.choose()).rejects.toThrow("sign-in changed");
    expect(state.picker).not.toHaveBeenCalled();
  });
  it.each([0, -1, 51, 1.5])(
    "rejects invalid selection limit %s",
    async (limit) => {
      const s = await setup();
      await expect(s.choose(limit)).rejects.toThrow("1 and 50");
      expect(state.picker).not.toHaveBeenCalled();
    },
  );
  it("camera denial leaves no temporary files", async () => {
    const s = await setup();
    state.permission.mockResolvedValue({ granted: false });
    await expect(
      s.owner.run((tx) => s.media.choosePhotos(tx, 1, true)),
    ).rejects.toThrow("Camera permission");
    expect(state.camera).not.toHaveBeenCalled();
    expect(state.files.size).toBe(0);
  });
});
