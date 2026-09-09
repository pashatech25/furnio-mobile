import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  values: new Map<string, string>(),
  platform: { OS: "ios" },
  sequence: 0,
  failWrite: false,
  failDelete: false,
}));
vi.mock("react-native", () => ({ Platform: fixture.platform }));
vi.mock("expo-crypto", () => ({
  randomUUID: () => `revision-${++fixture.sequence}`,
}));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  getItemAsync: vi.fn(async (key: string) => fixture.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (fixture.failWrite && key.endsWith(".1")) throw new Error("Disk full");
    fixture.values.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    if (fixture.failDelete) throw new Error("Cleanup unavailable");
    fixture.values.delete(key);
  }),
}));
import { secureStorage } from "./secure-storage";
beforeEach(() => {
  fixture.values.clear();
  fixture.platform.OS = "ios";
  fixture.failWrite = false;
  fixture.failDelete = false;
  vi.clearAllMocks();
});
describe("secure native storage", () => {
  it("roundtrips unicode without exceeding the per-entry UTF-8 byte budget", async () => {
    const value = "🏠én français 中文\n".repeat(800);
    await secureStorage.setItem("unicode", value);
    expect(await secureStorage.getItem("unicode")).toBe(value);
    for (const [key, chunk] of fixture.values)
      if (key !== "unicode")
        expect(new TextEncoder().encode(chunk).byteLength).toBeLessThanOrEqual(
          1800,
        );
  });
  it("preserves the previous session when writing new chunks fails", async () => {
    await secureStorage.setItem("session", "old-session");
    fixture.failWrite = true;
    await expect(
      secureStorage.setItem("session", "x".repeat(5000)),
    ).rejects.toThrow("Disk full");
    expect(await secureStorage.getItem("session")).toBe("old-session");
  });
  it("does not report failure after committing a new manifest if cleanup fails", async () => {
    await secureStorage.setItem("session", "old");
    fixture.failDelete = true;
    await expect(
      secureStorage.setItem("session", "new"),
    ).resolves.toBeUndefined();
    expect(await secureStorage.getItem("session")).toBe("new");
  });
  it("serializes concurrent updates to the same session", async () => {
    await Promise.all([
      secureStorage.setItem("session", "first"),
      secureStorage.setItem("session", "second"),
    ]);
    expect(await secureStorage.getItem("session")).toBe("second");
    expect(fixture.values.size).toBe(2);
  });
  it("clears the manifest and its data on removal", async () => {
    await secureStorage.setItem("remove", "x".repeat(8000));
    await secureStorage.removeItem("remove");
    expect(await secureStorage.getItem("remove")).toBeNull();
    expect(fixture.values.size).toBe(0);
  });
  it("does not follow malformed or foreign manifests", async () => {
    fixture.values.set("corrupt", "{");
    expect(await secureStorage.getItem("corrupt")).toBeNull();
    fixture.values.set(
      "corrupt",
      JSON.stringify({ prefix: "different-account", count: 1 }),
    );
    fixture.values.set("different-account.0", "private");
    await secureStorage.removeItem("corrupt");
    expect(fixture.values.get("different-account.0")).toBe("private");
  });
  it("rejects excessive data before writing chunks", async () => {
    await expect(
      secureStorage.setItem("oversize", "x".repeat(180_001)),
    ).rejects.toThrow("limit");
    expect(fixture.values.size).toBe(0);
  });
  it("uses only volatile memory for a browser preview", async () => {
    fixture.platform.OS = "web";
    await secureStorage.setItem("browser", "value");
    expect(await secureStorage.getItem("browser")).toBe("value");
    expect(fixture.values.size).toBe(0);
    await secureStorage.removeItem("browser");
    expect(await secureStorage.getItem("browser")).toBeNull();
  });
});
