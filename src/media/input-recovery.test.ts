import { describe, expect, it, vi } from "vitest";
import {
  createInputRecovery,
  inputSdkFile,
  InputCleanupError,
  type InputRecoveryIO,
} from "./input-recovery";
const id = (n: number) =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
function setup() {
  let serial = 0;
  const dirs = new Map<string, Map<string, "file" | "directory">>();
  const sdk = new Set<string>();
  const io: InputRecoveryIO = {
    sessions: () =>
      [...dirs.keys()].map((name) => ({ name, kind: "directory" })),
    entries: (key) =>
      [...(dirs.get(key) ?? [])].map(([name, kind]) => ({ name, kind })),
    create: vi.fn((key) => {
      if (dirs.has(key)) throw Error("collision");
      dirs.set(key, new Map());
    }),
    exists: (key, name) => dirs.get(key)?.has(name) ?? false,
    marker: vi.fn((key, name) => {
      dirs.get(key)!.set(name, "file");
    }),
    remove: vi.fn((key, name) => {
      dirs.get(key)?.delete(name);
    }),
    removeSdk: vi.fn((kind, name) => {
      sdk.delete(`${kind}/${name}`);
    }),
    removeEmpty: (key) => {
      if (dirs.get(key)?.size) throw Error("not empty");
      dirs.delete(key);
    },
  };
  const random = () => id(++serial);
  return {
    dirs,
    sdk,
    io,
    manager: createInputRecovery(io, random),
    restart: () => createInputRecovery(io, random),
  };
}
describe("private input ownership and restart recovery", () => {
  it("retains active selections across foreground, then collects only their declared files", () => {
    const s = setup(),
      lease = s.manager.start();
    const file = lease.allocate("jpg");
    s.dirs.get(lease.id)!.set(file, "file");
    expect(s.manager.recover().failed).toBe(0);
    expect(s.io.remove).not.toHaveBeenCalled();
    expect(lease.finish().failed).toBe(0);
    expect(s.dirs.size).toBe(0);
  });
  it("recovers partially copied JPEGs and PDFs after process death", () => {
    const s = setup(),
      lease = s.manager.start();
    for (const ext of ["jpg", "pdf"] as const)
      s.dirs.get(lease.id)!.set(lease.allocate(ext), "file");
    expect(s.restart().recover().failed).toBe(0);
    expect(s.dirs.size).toBe(0);
  });
  it.each(["picker", "picker-root", "document", "manipulator"] as const)(
    "registers exact %s copies without original names and releases them",
    (kind) => {
      const s = setup(),
        lease = s.manager.start(),
        name = `${id(91)}.jpg`;
      s.sdk.add(`${kind}/${name}`);
      s.sdk.add(`${kind}/${id(92)}.jpg`);
      const release = lease.rememberSdk(kind, name);
      expect(s.dirs.get(lease.id)?.has(`sdk-${kind}-${name}.owned`)).toBe(true);
      release();
      release();
      expect(s.sdk.size).toBe(1);
      lease.finish();
      expect(s.dirs.size).toBe(0);
    },
  );
  it("keeps a failed SDK deletion marker and retries on restart", () => {
    const s = setup(),
      lease = s.manager.start(),
      name = `${id(91)}.pdf`;
    s.sdk.add(`document/${name}`);
    lease.rememberSdk("document", name);
    vi.mocked(s.io.removeSdk).mockImplementationOnce(() => {
      throw Error("denied");
    });
    expect(lease.finish().failed).toBe(1);
    expect(s.dirs.get(lease.id)?.size).toBe(1);
    expect(s.restart().recover().failed).toBe(0);
    expect(s.sdk.size).toBe(0);
  });
  it("fails closed and retries in-memory if both the marker and immediate removal fail", () => {
    const s = setup(),
      lease = s.manager.start(),
      name = `${id(91)}.jpg`;
    vi.mocked(s.io.marker).mockImplementationOnce(() => {
      throw Error("private path");
    });
    vi.mocked(s.io.removeSdk).mockImplementationOnce(() => {
      throw Error("private path");
    });
    s.sdk.add(`picker/${name}`);
    expect(() => lease.rememberSdk("picker", name)).toThrow(InputCleanupError);
    expect(s.sdk.size).toBe(1);
    expect(lease.finish().failed).toBe(0);
    expect(s.sdk.size).toBe(0);
  });
  it.each(["../photo.jpg", "original.jpg", `input-${id(99)}.jpg?x=1`])(
    "does not delete an unknown name: %s",
    (name) => {
      const s = setup(),
        lease = s.manager.start();
      s.dirs.get(lease.id)!.set(name, "file");
      expect(lease.finish().failed).toBe(1);
      expect(s.io.remove).not.toHaveBeenCalled();
      expect(() => s.manager.start()).toThrow(InputCleanupError);
    },
  );
  it("never recurses into an unexpected directory", () => {
    const s = setup(),
      lease = s.manager.start();
    s.dirs.get(lease.id)!.set(lease.allocate("jpg"), "directory");
    expect(lease.finish().failed).toBe(1);
    expect(s.io.remove).not.toHaveBeenCalled();
  });
  it("rejects random collisions, invalid kinds, invalid names and allocation after finish", () => {
    const s = setup(),
      lease = s.manager.start();
    expect(() => lease.rememberSdk("document", "../../original.pdf")).toThrow(
      InputCleanupError,
    );
    expect(() => lease.rememberSdk("other" as never, `${id(99)}.jpg`)).toThrow(
      InputCleanupError,
    );
    expect(() => lease.allocate("png" as never)).toThrow(InputCleanupError);
    lease.finish();
    expect(() => lease.allocate("jpg")).toThrow(InputCleanupError);
    const collision = createInputRecovery(s.io, () => id(88));
    collision.start();
    expect(() => collision.start()).toThrow(InputCleanupError);
  });
});
describe("SDK source path boundaries", () => {
  const cache = "file:///current-container/cache/";
  it.each([
    ["picker", "ImagePicker/", "jpg", "ios"],
    ["picker", "", "HEIC", "ios"],
    ["document", "DocumentPicker/", "pdf", "android"],
    ["manipulator", "ImageManipulator/", "jpg", "ios"],
  ] as const)(
    "accepts the installed %s SDK location",
    (kind, directory, ext, os) => {
      expect(
        inputSdkFile(`${cache}${directory}${id(1)}.${ext}`, cache, kind, os)
          ?.name,
      ).toBe(`${id(1)}.${ext}`);
    },
  );
  it.each([
    "file:///Photos/original.jpg",
    "content://photo/1",
    "ph://asset/1",
    "https://private.invalid/photo.jpg",
    `${cache}ImagePicker/../original.jpg`,
    `${cache}ImagePicker/%2e%2e/original.jpg`,
    `${cache}ImagePicker/${id(1)}.jpg?download=1`,
    `${cache}ImagePicker/${id(1)}.jpg#x`,
    `${cache}ImagePicker/not-a-uuid.jpg`,
    `${cache}furnio-drafts-v2/${id(1)}.jpg`,
    `file:///old-container/cache/ImagePicker/${id(1)}.jpg`,
  ])("rejects a non-owned source without guessing: %s", (uri) => {
    expect(inputSdkFile(uri, cache, "picker", "ios")).toBeNull();
  });
  it("does not extend the iOS root fallback to Android or document selection", () => {
    expect(
      inputSdkFile(`${cache}${id(1)}.jpg`, cache, "picker", "android"),
    ).toBeNull();
    expect(
      inputSdkFile(`${cache}${id(1)}.pdf`, cache, "document", "ios"),
    ).toBeNull();
  });
});
