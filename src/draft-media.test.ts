import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  files: new Set<string>(),
  dirs: new Set<string>(),
  deleted: [] as string[],
  copied: [] as string[],
  platform: { OS: "ios" },
}));
vi.mock("react-native", () => ({ Platform: f.platform }));
vi.mock("expo-crypto", () => ({}));
vi.mock("expo-secure-store", () => ({}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { removeItem: vi.fn() },
}));
vi.mock("./auth/secure-storage", () => ({ secureStorage: {} }));
vi.mock("./config", () => ({
  config: { mode: "demo", supabase: "", platform: "" },
}));
vi.mock("expo-file-system", () => {
  const join = (parts: (string | { uri: string })[]) =>
    parts
      .map((p) => (typeof p === "string" ? p : p.uri))
      .map((p, i) =>
        i === 0 ? p.replace(/\/$/, "") : p.replace(/^\/+|\/+$/g, ""),
      )
      .join("/");
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return f.files.has(this.uri);
    }
    get name() {
      return this.uri.split("/").at(-1)!;
    }
    copy(to: File) {
      if (!this.exists) throw new Error("missing");
      f.files.add(to.uri);
      f.copied.push(to.uri);
    }
    delete() {
      f.files.delete(this.uri);
      f.deleted.push(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return f.dirs.has(this.uri);
    }
    get name() {
      return this.uri.split("/").at(-1)!;
    }
    get parentDirectory() {
      return new Directory(this.uri.slice(0, this.uri.lastIndexOf("/")));
    }
    create() {
      let path = this.uri;
      while (path.startsWith("file:///cache")) {
        f.dirs.add(path);
        path = path.slice(0, path.lastIndexOf("/"));
      }
    }
    list() {
      return [
        ...[...f.dirs]
          .filter(
            (p) =>
              p.startsWith(this.uri + "/") &&
              !p.slice(this.uri.length + 1).includes("/"),
          )
          .map((p) => new Directory(p)),
        ...[...f.files]
          .filter(
            (p) =>
              p.startsWith(this.uri + "/") &&
              !p.slice(this.uri.length + 1).includes("/"),
          )
          .map((p) => new File(p)),
      ];
    }
    delete() {
      f.deleted.push(this.uri);
      for (const path of f.files)
        if (path.startsWith(this.uri + "/")) f.files.delete(path);
      for (const path of f.dirs)
        if (path === this.uri || path.startsWith(this.uri + "/"))
          f.dirs.delete(path);
    }
  }
  return { File, Directory, Paths: { cache: { uri: "file:///cache/" } } };
});
import {
  cacheSource,
  nativeDraftMedia,
  loadDraft,
  saveDraft,
  setDraftOwner,
} from "./drafts";
const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  one = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  two = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  scope = "a".repeat(64);
const photo = {
  uri: "file:///cache/picker/photo.jpg",
  name: "photo.jpg",
  contentType: "image/jpeg" as const,
  bytes: 1000,
  width: 100,
  height: 100,
};
beforeEach(() => {
  f.files.clear();
  f.dirs.clear();
  f.deleted.length = 0;
  f.copied.length = 0;
  f.files.add(photo.uri);
  f.platform.OS = "ios";
});
describe("native draft cache boundaries", () => {
  it("copies before replacing, never deletes a picker original, and preserves other accounts", async () => {
    const m = nativeDraftMedia(scope);
    const a = await m.copy(user, "virtual_staging", one, [photo]);
    const b = await m.copy(other, "virtual_staging", one, [photo]);
    const c = await m.copy(user, "virtual_staging", two, a);
    await m.clear(user, "virtual_staging", two);
    expect(f.files.has(a[0]!.uri)).toBe(false);
    expect(f.files.has(c[0]!.uri)).toBe(true);
    await m.clear(user, "virtual_staging");
    expect(f.files.has(b[0]!.uri)).toBe(true);
    expect(f.files.has(photo.uri)).toBe(true);
    expect(
      f.deleted.every(
        (path) =>
          path.includes("/" + user + "/virtual_staging/") ||
          path.endsWith("/" + user + "/virtual_staging"),
      ),
    ).toBe(true);
  });
  it("keeps PDF format and numbered references", async () => {
    const m = nativeDraftMedia(scope),
      p = { ...photo, contentType: "application/pdf" as const };
    const copies = await m.copy(user, "floor_plan", one, [p, photo]);
    expect(copies[0]!.uri).toMatch(/\/0.pdf$/);
    expect(copies[1]!.uri).toMatch(/\/1.jpg$/);
  });
  it.each([
    "https://host/photo.jpg",
    "file:///elsewhere/photo.jpg",
    "file:///cache/%2e%2e/photo.jpg",
    "file:///cache/a/../b.jpg",
    "file:///cache/a%5cb.jpg",
    "file:///cache/a%00.jpg",
    "file:///cache/a.jpg?token=x",
    "file:///cache/%",
    "file:///cache/",
  ])("rejects unsafe source paths: %s", async (uri) => {
    f.files.add(uri);
    expect(cacheSource(uri, "file:///cache/")).toBe(false);
    await expect(
      nativeDraftMedia(scope).copy(user, "virtual_staging", one, [
        { ...photo, uri },
      ]),
    ).rejects.toThrow("unavailable");
    expect(f.copied).toEqual([]);
    expect(f.deleted).toEqual([]);
  });
  it("rejects raw and encoded other-account draft paths", async () => {
    const m = nativeDraftMedia(scope),
      b = await m.copy(other, "virtual_staging", one, [photo]);
    for (const uri of [b[0]!.uri, b[0]!.uri.replace("furnio", "%66urnio")]) {
      f.files.add(uri);
      await expect(
        m.copy(user, "virtual_staging", two, [{ ...photo, uri }]),
      ).rejects.toThrow("another account");
    }
  });
  it("refuses foreign scope/service/generation and path traversal before deletion", async () => {
    const m = nativeDraftMedia(scope),
      a = await m.copy(user, "virtual_staging", one, [photo]);
    expect(m.exists(user, "twilight", one, a[0]!.uri)).toBe(false);
    expect(m.exists(user, "virtual_staging", two, a[0]!.uri)).toBe(false);
    expect(
      m.exists(user, "virtual_staging", one, a[0]!.uri + "/../0.jpg"),
    ).toBe(false);
    await expect(m.clear("../bad", "virtual_staging")).rejects.toThrow();
    await expect(m.clear(user, "../bad" as never)).rejects.toThrow();
    expect(f.deleted).toEqual([]);
  });
  it("does not partially sweep if a foreign child is present", async () => {
    const m = nativeDraftMedia(scope),
      a = await m.copy(user, "virtual_staging", one, [photo]);
    await m.copy(user, "virtual_staging", two, [photo]);
    const servicePath = a[0]!.uri.slice(0, a[0]!.uri.indexOf("/" + one));
    f.files.add(servicePath + "/unknown.txt");
    await expect(m.clear(user, "virtual_staging", two)).rejects.toThrow(
      "attention",
    );
    expect(f.deleted).toEqual([]);
  });
  it("never persists browser-preview photos", async () => {
    f.platform.OS = "web";
    await setDraftOwner(user);
    expect(await loadDraft(user, "twilight")).toBeNull();
    await expect(saveDraft(user, "twilight", {} as never)).rejects.toThrow(
      "native-only",
    );
    expect(f.copied).toEqual([]);
  });
});
