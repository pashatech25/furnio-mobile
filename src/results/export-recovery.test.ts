import { describe, expect, it, vi } from "vitest";
import {
  createExportRecovery,
  ExportRecoveryError,
  sdkExportName,
  SHARE_RETENTION_MS,
  type ExportRecoveryIO,
  type RecoveryEntry,
} from "./export-recovery";

const id = (n: number) =>
  `12345678-1234-1234-1234-${String(n).padStart(12, "0")}`;
function setup() {
  let serial = 0,
    time = 1_789_000_000_000;
  const directories = new Map<string, Map<string, RecoveryEntry>>();
  const sdkFiles = new Set<string>();
  const put = (
    session: string,
    name: string,
    kind: RecoveryEntry["kind"] = "file",
  ) => {
    directories.get(session)!.set(name, { name, kind });
  };
  const io: ExportRecoveryIO = {
    sessions: vi.fn(() =>
      [...directories.keys()].map((name) => ({ name, kind: "directory" })),
    ),
    entries: vi.fn((session) => [...directories.get(session)!.values()]),
    createSession: vi.fn((session) => {
      if (directories.has(session)) throw new Error("collision");
      directories.set(session, new Map());
    }),
    exists: (session, name) => directories.get(session)!.has(name),
    marker: vi.fn((session, name) => put(session, name)),
    removeFile: vi.fn((session, name) => {
      directories.get(session)!.delete(name);
    }),
    removeSdkFile: vi.fn((name) => {
      sdkFiles.delete(name);
    }),
    removeEmptySession: vi.fn((session) => {
      if (directories.get(session)!.size) throw new Error("not empty");
      directories.delete(session);
    }),
  };
  const random = vi.fn(() => id(++serial));
  const fresh = () => createExportRecovery(io, random, () => time);
  return {
    io,
    directories,
    sdkFiles,
    put,
    random,
    fresh,
    manager: fresh(),
    time: () => time,
    setTime: (next: number) => {
      time = next;
    },
  };
}

describe("durable result export ownership", () => {
  it("creates a unique folder before allocating files and retains live files", () => {
    const s = setup(),
      lease = s.manager.start();
    for (const kind of ["source", "label", "final"] as const) {
      const name = lease.allocate(kind);
      expect(lease.owns(name)).toBe(true);
      s.put(lease.session, name);
    }
    expect(s.directories.get(lease.session)?.size).toBe(3);
    expect(s.manager.recover()).toEqual({ failed: 0, retainedShares: 0 });
    expect(s.io.removeFile).not.toHaveBeenCalled();
    expect(lease.finish().failed).toBe(0);
    expect(s.directories.size).toBe(0);
  });
  it("collects an abandoned partial destination on a fresh process", () => {
    const s = setup(),
      lease = s.manager.start();
    s.put(lease.session, lease.allocate("source"));
    expect(s.fresh().recover()).toEqual({ failed: 0, retainedShares: 0 });
    expect(s.directories.size).toBe(0);
  });
  it("rebases SDK names and removes the marker only after the SDK file", () => {
    const s = setup(),
      lease = s.manager.start(),
      sdk = `${id(99)}.jpg`;
    s.sdkFiles.add(sdk);
    lease.rememberSdk(sdk);
    lease.rememberSdk(sdk);
    expect(s.io.marker).toHaveBeenCalledOnce();
    expect(s.fresh().recover().failed).toBe(0);
    expect(s.sdkFiles.size).toBe(0);
    expect(
      vi.mocked(s.io.removeSdkFile).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(s.io.removeFile).mock.invocationCallOrder[0]!);
  });
  it("retries failed SDK removal without losing its ownership marker", () => {
    const s = setup(),
      lease = s.manager.start(),
      sdk = `${id(99)}.jpg`;
    s.sdkFiles.add(sdk);
    lease.rememberSdk(sdk);
    s.put(lease.session, lease.allocate("final"));
    vi.mocked(s.io.removeSdkFile).mockImplementationOnce(() => {
      throw new Error("denied");
    });
    expect(s.fresh().recover().failed).toBe(1);
    expect([...s.directories.get(lease.session)!.keys()]).toEqual([
      `sdk-${sdk}.owned`,
    ]);
    expect(s.fresh().recover().failed).toBe(0);
    expect(s.directories.size).toBe(0);
  });
  it("retries marker deletion even when the SDK file was already removed", () => {
    const s = setup(),
      lease = s.manager.start();
    lease.rememberSdk(`${id(99)}.jpg`);
    vi.mocked(s.io.removeFile).mockImplementationOnce(() => {
      throw new Error("denied");
    });
    expect(s.fresh().recover().failed).toBe(1);
    expect(s.fresh().recover().failed).toBe(0);
  });
  it("protects an interrupted share until the exact retention boundary", () => {
    const s = setup(),
      lease = s.manager.start();
    s.put(lease.session, lease.allocate("final"));
    lease.beginShare();
    const started = s.time();
    s.setTime(started + SHARE_RETENTION_MS - 1);
    expect(s.fresh().recover()).toEqual({ failed: 0, retainedShares: 1 });
    expect(s.io.removeFile).not.toHaveBeenCalled();
    s.setTime(started + SHARE_RETENTION_MS);
    expect(s.fresh().recover()).toEqual({ failed: 0, retainedShares: 0 });
    expect(s.directories.size).toBe(0);
  });
  it("does not expire a still-live share even after 24 hours", () => {
    const s = setup(),
      lease = s.manager.start();
    s.put(lease.session, lease.allocate("final"));
    lease.beginShare();
    s.setTime(s.time() + SHARE_RETENTION_MS * 2);
    expect(s.manager.recover().failed).toBe(0);
    expect(s.io.removeFile).not.toHaveBeenCalled();
  });
  it("normal share closure is idempotent and allows immediate cleanup", () => {
    const s = setup(),
      lease = s.manager.start();
    s.put(lease.session, lease.allocate("final"));
    const close = lease.beginShare();
    close();
    close();
    expect(s.io.removeFile).toHaveBeenCalledTimes(1);
    expect(lease.finish()).toEqual({ failed: 0, retainedShares: 0 });
    expect(s.directories.size).toBe(0);
  });
  it("marker cleanup failure does not replace the share outcome and can retry", () => {
    const s = setup(),
      lease = s.manager.start(),
      close = lease.beginShare();
    vi.mocked(s.io.removeFile).mockImplementationOnce(() => {
      throw new Error("private path");
    });
    expect(() => close()).not.toThrow();
    expect(s.fresh().recover().retainedShares).toBe(1);
    close();
    expect(lease.finish().retainedShares).toBe(0);
  });
  it("allows another export while an abandoned share is retained", () => {
    const s = setup(),
      old = s.manager.start();
    old.beginShare();
    expect(s.fresh().start().session).not.toBe(old.session);
    expect(s.directories.size).toBe(2);
  });
  it.each([
    "../outside",
    "/original.jpg",
    `source-${id(90)}.jpg?query=1`,
    "notes.txt",
    `sdk-../${id(90)}.jpg.owned`,
  ])("refuses unexpected session entry %s before deleting anything", (name) => {
    const s = setup(),
      lease = s.manager.start();
    s.put(lease.session, lease.allocate("final"));
    s.put(lease.session, name);
    expect(s.fresh().recover().failed).toBe(1);
    expect(s.io.removeFile).not.toHaveBeenCalled();
    expect(s.io.removeSdkFile).not.toHaveBeenCalled();
    expect(() => s.fresh().start()).toThrow(ExportRecoveryError);
  });
  it("never recurses into a directory even when its name looks like a file", () => {
    const s = setup(),
      lease = s.manager.start();
    s.put(lease.session, lease.allocate("source"), "directory");
    expect(s.fresh().recover().failed).toBe(1);
    expect(s.io.removeFile).not.toHaveBeenCalled();
  });
  it("leaves unknown root folders untouched while cleaning known sessions", () => {
    const s = setup(),
      lease = s.manager.start();
    s.put(lease.session, lease.allocate("final"));
    s.directories.set("saved-drafts", new Map());
    expect(s.fresh().recover().failed).toBe(1);
    expect([...s.directories.keys()]).toEqual(["saved-drafts"]);
  });
  it("does not traverse a root file named like a session", () => {
    const s = setup();
    vi.mocked(s.io.sessions).mockReturnValue([{ name: id(1), kind: "file" }]);
    expect(s.manager.recover().failed).toBe(1);
    expect(s.io.entries).not.toHaveBeenCalled();
  });
  it("protects shares if the clock moves backwards", () => {
    const s = setup(),
      lease = s.manager.start();
    lease.beginShare();
    s.setTime(s.time() - 1);
    expect(s.fresh().recover().failed).toBe(1);
    expect(s.io.removeFile).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -1, 1.5])(
    "fails closed for invalid clock %s",
    (time) => {
      const s = setup(),
        lease = s.manager.start();
      s.put(lease.session, lease.allocate("final"));
      s.setTime(time);
      expect(s.fresh().recover().failed).toBe(1);
      expect(s.io.removeFile).not.toHaveBeenCalled();
    },
  );
  it("reports listing/removal errors and continues independent sessions", () => {
    const s = setup(),
      a = s.manager.start(),
      b = s.manager.start();
    s.put(a.session, a.allocate("final"));
    s.put(b.session, b.allocate("final"));
    vi.mocked(s.io.entries).mockImplementationOnce(() => {
      throw new Error("denied");
    });
    expect(s.fresh().recover().failed).toBe(1);
    expect(s.directories.has(a.session)).toBe(true);
    expect(s.directories.has(b.session)).toBe(false);
    vi.mocked(s.io.sessions).mockImplementationOnce(() => {
      throw new Error("denied");
    });
    expect(s.fresh().recover().failed).toBe(1);
    expect(s.fresh().recover().failed).toBe(0);
  });
  it("retains a directory if final empty-directory deletion fails", () => {
    const s = setup();
    s.manager.start();
    vi.mocked(s.io.removeEmptySession).mockImplementationOnce(() => {
      throw new Error("denied");
    });
    expect(s.fresh().recover().failed).toBe(1);
    expect(s.fresh().recover().failed).toBe(0);
  });
  it("rejects allocation/name reuse and use after release", () => {
    const s = setup(),
      lease = s.manager.start();
    s.random.mockReturnValue(id(90));
    const name = lease.allocate("source");
    expect(() => lease.allocate("source")).toThrow(ExportRecoveryError);
    expect(() => lease.rememberSdk("../original.jpg")).toThrow(
      ExportRecoveryError,
    );
    lease.finish();
    expect(lease.owns(name)).toBe(false);
    expect(() => lease.allocate("final")).toThrow(ExportRecoveryError);
    expect(() => lease.beginShare()).toThrow(ExportRecoveryError);
  });
  it("refuses invalid or active session IDs", () => {
    const s = setup(),
      lease = s.manager.start();
    s.random.mockReturnValue(lease.session);
    expect(() => s.manager.start()).toThrow(ExportRecoveryError);
    s.random.mockReturnValue("../outside");
    expect(() => s.manager.start()).toThrow(ExportRecoveryError);
  });
});

describe("SDK path rebasing", () => {
  const cache = "file:///new-container/Library/Caches/",
    name = `${id(99)}.jpg`;
  it("accepts only the direct SDK JPEG path in the current cache", () => {
    expect(sdkExportName(`${cache}ImageManipulator/${name}`, cache)).toBe(name);
    expect(
      sdkExportName(`${cache}ImageManipulator/${name}`, cache.slice(0, -1)),
    ).toBe(name);
  });
  it.each([
    `file:///old-container/Library/Caches/ImageManipulator/${name}`,
    `${cache}ImageManipulator/../${name}`,
    `${cache}ImageManipulator/%2e%2e/${name}`,
    `${cache}ImageManipulator/${name}?secret=1`,
    `${cache}ImageManipulator/nested/${name}`,
    `${cache}furnio-drafts-v2/${name}`,
    `${cache}ImagePicker/${name}`,
    `https://example.com/ImageManipulator/${name}`,
    `${cache}ImageManipulator/original.jpg`,
  ])("rejects foreign/ambiguous path %s", (uri) =>
    expect(sdkExportName(uri, cache)).toBeNull(),
  );
});
