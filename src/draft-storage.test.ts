import { describe, expect, it, vi } from "vitest";
import { createDraftStorage } from "./draft-storage";
const key =
  "furnio.drafts-v2." +
  "a".repeat(64) +
  ".aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.virtual_staging";
function fixture() {
  const values = new Map<string, string>();
  let sequence = 0;
  const deps = {
    get: vi.fn(async (k: string) => values.get(k) ?? null),
    set: vi.fn(async (k: string, value: string) => {
      values.set(k, value);
    }),
    remove: vi.fn(async (k: string) => {
      values.delete(k);
    }),
    uuid: () =>
      "bbbbbbbb-bbbb-4bbb-8bbb-" + String(++sequence).padStart(12, "0"),
  };
  return { values, deps, next: () => createDraftStorage(deps) };
}
describe("recoverable draft-only secure storage", () => {
  it("roundtrips bounded Unicode chunks and removes all indexed pieces", async () => {
    const f = fixture(),
      s = f.next(),
      value = "🏠é中文".repeat(900);
    await s.setItem(key, value);
    expect(await s.getItem(key)).toBe(value);
    for (const [k, v] of f.values)
      if (k.includes(".body."))
        expect(new TextEncoder().encode(v).byteLength).toBeLessThanOrEqual(
          1800,
        );
    await s.removeItem(key);
    expect(f.values.size).toBe(0);
  });
  it("resumes interrupted deletion without losing the index", async () => {
    const f = fixture(),
      s = f.next();
    await s.setItem(key, "x".repeat(6000));
    f.deps.remove.mockRejectedValueOnce(new Error("locked"));
    await expect(s.removeItem(key)).rejects.toThrow("locked");
    expect(JSON.parse(f.values.get(key + ".index")!).active).toBeNull();
    await f.next().removeItem(key);
    expect(f.values.size).toBe(0);
  });
  it("preserves the old draft and indexes partially written new pieces", async () => {
    const f = fixture(),
      s = f.next();
    await s.setItem(key, "old");
    f.deps.set.mockImplementation(async (k, v) => {
      if (k.endsWith(".1")) throw new Error("full");
      f.values.set(k, v);
    });
    await expect(s.setItem(key, "x".repeat(5000))).rejects.toThrow("full");
    expect(await f.next().getItem(key)).toBe("old");
    expect(f.values.size).toBe(2);
  });
  it("retains old-piece cleanup after committing replacement", async () => {
    const f = fixture(),
      s = f.next();
    await s.setItem(key, "old");
    f.deps.remove.mockRejectedValueOnce(new Error("locked"));
    await expect(s.setItem(key, "new")).rejects.toThrow("locked");
    expect(await f.next().getItem(key)).toBe("new");
    expect(f.values.size).toBe(2);
  });
  it("keeps a lost manifest write recoverable", async () => {
    const f = fixture(),
      s = f.next();
    await s.setItem(key, "old");
    let indices = 0;
    f.deps.set.mockImplementation(async (k, v) => {
      if (k.endsWith(".index") && ++indices === 2)
        throw new Error("interrupted commit");
      f.values.set(k, v);
    });
    await expect(s.setItem(key, "new")).rejects.toThrow("interrupted commit");
    expect(await f.next().getItem(key)).toBe("old");
    expect(f.values.size).toBe(2);
  });
  it("serializes simultaneous saves and removal", async () => {
    const f = fixture(),
      s = f.next();
    await Promise.all([
      s.setItem(key, "one"),
      s.setItem(key, "two"),
      s.removeItem(key),
    ]);
    expect(f.values.size).toBe(0);
  });
  it("never accepts credential or receipt keys", async () => {
    const f = fixture(),
      s = f.next();
    for (const k of [
      "auth-token",
      "furnio.purchase-receipt",
      "furnio.deletion-receipt",
      key + "/../auth",
    ])
      await expect(s.removeItem(k)).rejects.toThrow("Invalid");
    expect(f.deps.remove).not.toHaveBeenCalled();
  });
  it("refuses corrupted/foreign deletion pointers without removing anything", async () => {
    const f = fixture(),
      s = f.next();
    for (const value of [
      "{",
      JSON.stringify({
        version: 1,
        active: null,
        pending: [{ id: "../../auth", count: 3 }],
      }),
    ]) {
      f.values.set(key + ".index", value);
      await expect(s.removeItem(key)).rejects.toThrow("invalid");
    }
    expect(f.deps.remove).not.toHaveBeenCalled();
  });
  it("rejects oversized writes before any mutation", async () => {
    const f = fixture();
    await expect(f.next().setItem(key, "x".repeat(180_001))).rejects.toThrow(
      "capacity",
    );
    expect(f.values.size).toBe(0);
  });
});
