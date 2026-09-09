import { beforeEach, describe, it, expect, vi } from "vitest";
const values = vi.hoisted(() => new Map<string, string>());
vi.mock("../auth/secure-storage", () => ({
  secureStorage: {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: async (key: string) => {
      values.delete(key);
    },
  },
}));
import {
  saveBatchJournal,
  loadBatchJournal,
  clearBatchJournal,
  type BatchJournal,
} from "./journal";
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const journal: BatchJournal = {
  version: 1,
  userId: user,
  projectId: user,
  idempotencyKey: "fixture-batch-idempotency",
  startedAt: Date.now(),
  batchId: null,
  expiresAt: null,
  jobIds: [],
  phase: "reserving",
};
beforeEach(() => values.clear());
describe("batch intent recovery", () => {
  it("records an intent before the reservation ID is known", async () => {
    await saveBatchJournal(journal);
    expect(await loadBatchJournal(user)).toEqual(journal);
  });
  it("isolates different Furnio accounts", async () => {
    await saveBatchJournal(journal);
    expect(await loadBatchJournal(other)).toBeNull();
  });
  it("rejects copied cross-account records", async () => {
    values.set("furnio.batch-recovery." + other, JSON.stringify(journal));
    await expect(loadBatchJournal(other)).rejects.toThrow("incompatible");
  });
  it("does not discard corrupt intent and silently permit an automatic resubmission", async () => {
    values.set("furnio.batch-recovery." + user, "broken");
    await expect(loadBatchJournal(user)).rejects.toThrow("unreadable");
    expect(values.size).toBe(1);
  });
  it("keeps only bounded job references, not photos, credentials or upload URLs", async () => {
    await saveBatchJournal({
      ...journal,
      photo: "PRIVATE PHOTO",
      token: "SECRET",
      uploadUrl: "https://storage.invalid",
    } as BatchJournal);
    expect([...values.values()][0]).not.toMatch(
      /PRIVATE|SECRET|storage\.invalid/,
    );
  });
  it("clears only the chosen account reminder", async () => {
    await saveBatchJournal(journal);
    await saveBatchJournal({ ...journal, userId: other });
    await clearBatchJournal(user);
    expect(await loadBatchJournal(user)).toBeNull();
    expect(await loadBatchJournal(other)).toBeTruthy();
  });
});
