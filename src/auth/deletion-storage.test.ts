import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  values: new Map<string, string>(),
  platform: { OS: "ios" },
  fail: "",
}));
vi.mock("react-native", () => ({ Platform: fixture.platform }));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  getItemAsync: vi.fn(async (key: string) => fixture.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (key === fixture.fail) throw new Error("Write unavailable");
    fixture.values.set(key, value);
  }),
}));
import * as SecureStore from "expo-secure-store";
import { createDeletionStorage } from "./deletion-storage";
const id = "11111111-1111-4111-8111-111111111111",
  key = `furnio-deletion-staging_fixture-${id}`,
  bookmark = "furnio-deletion-last-staging_fixture";
beforeEach(() => {
  fixture.values.clear();
  fixture.platform.OS = "ios";
  fixture.fail = "";
  vi.clearAllMocks();
});
describe("device-only deletion receipt storage", () => {
  it("saves the capability before its minimal signed-out bookmark", async () => {
    const store = createDeletionStorage("staging_fixture");
    await store.setItem(key, "fixture-receipt");
    expect(await store.getItem(key)).toBe("fixture-receipt");
    expect(await store.lastUser()).toBe(id);
    expect(SecureStore.setItemAsync).toHaveBeenNthCalledWith(
      1,
      key,
      "fixture-receipt",
      { keychainAccessible: "device-only" },
    );
    expect(SecureStore.setItemAsync).toHaveBeenNthCalledWith(2, bookmark, id, {
      keychainAccessible: "device-only",
    });
  });
  it("fails closed when bookmarking fails but preserves the original capability", async () => {
    const store = createDeletionStorage("staging_fixture");
    fixture.fail = bookmark;
    await expect(store.setItem(key, "fixture-receipt")).rejects.toThrow();
    expect(await store.getItem(key)).toBe("fixture-receipt");
  });
  it("passes corrupt receipts to strict journal validation instead of replacing them", async () => {
    fixture.values.set(key, "{");
    expect(await createDeletionStorage("staging_fixture").getItem(key)).toBe(
      "{",
    );
  });
  it("fails closed for corrupt bookmarks and cross-environment keys", async () => {
    const store = createDeletionStorage("staging_fixture");
    fixture.values.set(bookmark, "not-an-id");
    await expect(store.lastUser()).rejects.toThrow("not been replaced");
    await expect(
      store.getItem(key.replace("staging", "production")),
    ).rejects.toThrow("Invalid");
  });
  it("rejects browser storage and oversized UTF-8 before writes", async () => {
    const store = createDeletionStorage("staging_fixture");
    await expect(store.setItem(key, "🏠".repeat(501))).rejects.toThrow("limit");
    fixture.platform.OS = "web";
    await expect(store.setItem(key, "fixture")).rejects.toThrow("native");
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
