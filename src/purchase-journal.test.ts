import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./config", () => ({ config: { mode: "staging" } }));
vi.mock("./auth/secure-storage", () => ({
  secureStorage: {
    getItem: async (key: string) => storage.values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.values.set(key, value);
    },
    removeItem: async (key: string) => {
      storage.values.delete(key);
    },
  },
}));
import {
  readPurchaseJournal,
  savePurchaseJournal,
  clearPurchaseJournal,
} from "./purchase-journal";
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const journal = {
  requestId: other,
  intentId: null,
  productId: "pack20",
  phase: "preparing" as const,
};
beforeEach(() => storage.values.clear());
describe("account-scoped encrypted purchase recovery journal", () => {
  it("separates accounts, build environments and stores", async () => {
    await savePurchaseJournal(user, journal);
    expect(await readPurchaseJournal(user)).toEqual(journal);
    expect(await readPurchaseJournal(other)).toBeNull();
    expect([...storage.values.keys()]).toEqual([
      `furnio.purchase.staging.ios.${user}`,
    ]);
  });
  it("clearing one account cannot remove another account's pending payment", async () => {
    await savePurchaseJournal(user, journal);
    await savePurchaseJournal(other, journal);
    await clearPurchaseJournal(user);
    expect(await readPurchaseJournal(user)).toBeNull();
    expect(await readPurchaseJournal(other)).toEqual(journal);
  });
  it("fails closed on corrupt recovery state", async () => {
    storage.values.set(`furnio.purchase.staging.ios.${user}`, "corrupt");
    await expect(readPurchaseJournal(user)).rejects.toThrow();
  });
  it("does not persist receipts or raw provider responses", async () => {
    await expect(
      savePurchaseJournal(user, {
        ...journal,
        receipt: "not-permitted",
      } as typeof journal),
    ).rejects.toThrow();
    expect(storage.values.size).toBe(0);
  });
  it.each([
    "cancelled",
    "payment_pending",
    "already_owned",
    "unknown",
  ] as const)(
    "retains only the %s store observation under the original account",
    async (observation) => {
      const saved = {
        ...journal,
        phase: "launched" as const,
        intentId: other,
        observation,
      };
      await savePurchaseJournal(user, saved);
      expect(await readPurchaseJournal(user)).toEqual(saved);
      expect(await readPurchaseJournal(other)).toBeNull();
    },
  );
  it.each([
    { observation: "cancelled" },
    { phase: "launched", observation: "cancelled" },
    {
      phase: "launched",
      intentId: other,
      observation: "cancelled",
      transactionId: "paid",
    },
    { phase: "launched", intentId: other, observation: "paid" },
  ])("rejects impossible observation state %j", async (changes) => {
    await expect(
      savePurchaseJournal(user, { ...journal, ...changes } as typeof journal),
    ).rejects.toThrow();
    expect(storage.values.size).toBe(0);
  });
});
