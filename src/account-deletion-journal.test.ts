import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createDeletionJournal } from "./account-deletion-journal";
import { AccountPrivacyError } from "./account-deletion-transport";
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-09-09T08:00:10Z");
function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
  const statuses = new Map<string, ReturnType<typeof makeStatus>>();
  let dropped = "";
  const send = vi.fn(
    async (action: string, input: { requestId: string }, _user: string) => {
      const status =
        statuses.get(input.requestId) ?? makeStatus(input.requestId);
      if (action === "confirm") {
        status.state = "queued";
        status.confirmedAt = "2026-09-09T08:00:10Z";
      }
      if (action === "cancel" && status.state === "prepared")
        status.state = "cancelled";
      statuses.set(input.requestId, status);
      if (dropped === action) {
        dropped = "";
        throw new Error("Connection lost");
      }
      return action === "prepare"
        ? {
            ...status,
            challenge: other,
            noticeVersion: "shared-account-v1",
            canConfirm: true,
            review: {
              version: 1,
              scope: "shared_furnio_account",
              canRequestDeletion: false,
              accountAccess: "active",
              counts: { projects: 2, storedAssets: 3, unfinishedJobs: 0 },
              subscriptions: [],
              linkedProviders: ["email"],
              hasDeveloperWorkspace: false,
              hasAdministratorRole: false,
            },
          }
        : { ...status };
    },
  );
  const deps = {
    storage,
    namespace: "staging-fixture",
    uuid: randomUUID,
    secret: async () => "c7".repeat(32),
    now: () => now,
    send,
  };
  return {
    values,
    storage,
    send,
    statuses,
    deps,
    journal: createDeletionJournal(deps),
    drop: (action: string) => {
      dropped = action;
    },
  };
}
function makeStatus(requestId: string) {
  return {
    version: 1,
    requestId,
    state: "prepared",
    createdAt: "2026-09-09T08:00:00Z",
    expiresAt: "2026-09-09T08:04:30Z",
    confirmedAt: null as string | null,
  };
}
const explicit = {
  confirmation: "DELETE MY FURNIO ACCOUNT",
  acknowledgeSharedAccount: true,
  acknowledgeBilling: true,
};
describe("durable native deletion confirmation", () => {
  it.each([429, 503])(
    "keeps the receipt unchanged after a status %s response without retrying",
    async (status) => {
      const f = fixture();
      await f.journal.prepare(user);
      const before = await f.journal.read(user);
      f.send.mockRejectedValueOnce(
        new AccountPrivacyError("Check status later", status),
      );
      await expect(f.journal.refresh(user)).rejects.toMatchObject({ status });
      expect(await f.journal.read(user)).toEqual(before);
      expect(f.send).toHaveBeenCalledTimes(2);
      expect(f.send.mock.calls.map(([action]) => action)).toEqual([
        "prepare",
        "status",
      ]);
      expect(f.storage.setItem).toHaveBeenCalledTimes(2);
    },
  );
  it("stores receipt capability before contacting the server and omits review/nonce from storage", async () => {
    const f = fixture();
    await f.journal.prepare(user);
    expect(f.storage.setItem.mock.invocationCallOrder[0]).toBeLessThan(
      f.send.mock.invocationCallOrder[0],
    );
    expect([...f.values.values()][0]).not.toContain("challenge");
    expect([...f.values.values()][0]).not.toContain("storedAssets");
  });
  it("refuses network mutation when secure persistence fails", async () => {
    const f = fixture();
    f.storage.setItem.mockRejectedValue(new Error("Locked keychain"));
    await expect(f.journal.prepare(user)).rejects.toThrow("Locked keychain");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("reuses the same id and secret after a lost preparation response and app restart", async () => {
    const f = fixture();
    f.drop("prepare");
    await expect(f.journal.prepare(user)).rejects.toThrow("Connection lost");
    const before = await f.journal.read(user);
    const restarted = createDeletionJournal(f.deps);
    const review = await restarted.prepare(user);
    expect(review.requestId).toBe(before?.capability.requestId);
    expect(f.send.mock.calls[0][1]).toEqual(f.send.mock.calls[1][1]);
  });
  it("does not automatically repeat a lost confirmation", async () => {
    const f = fixture();
    const review = await f.journal.prepare(user);
    f.drop("confirm");
    await expect(f.journal.confirm(user, review, explicit)).rejects.toThrow(
      "Connection lost",
    );
    expect((await f.journal.read(user))?.phase).toBe("confirming");
    const restarted = createDeletionJournal(f.deps);
    expect((await restarted.refresh(user))?.phase).toBe("queued");
    await restarted.confirm(user, review, explicit);
    expect(
      f.send.mock.calls.filter((call) => call[0] === "confirm"),
    ).toHaveLength(1);
  });
  it("serializes double taps into one confirmation and one status read", async () => {
    const f = fixture();
    const review = await f.journal.prepare(user);
    await Promise.all([
      f.journal.confirm(user, review, explicit),
      f.journal.confirm(user, review, explicit),
    ]);
    expect(
      f.send.mock.calls.filter((call) => call[0] === "confirm"),
    ).toHaveLength(1);
  });
  it("cannot confirm another account's review", async () => {
    const f = fixture();
    const first = await f.journal.prepare(user);
    await f.journal.prepare(other);
    await expect(f.journal.confirm(other, first, explicit)).rejects.toThrow(
      "review",
    );
    expect(
      f.send.mock.calls.filter((call) => call[0] === "confirm"),
    ).toHaveLength(0);
  });
  it.each([
    { ...explicit, acknowledgeBilling: false },
    { ...explicit, acknowledgeSharedAccount: false },
    { ...explicit, confirmation: "DELETE" },
  ])(
    "requires both explicit acknowledgements and exact text",
    async (value) => {
      const f = fixture();
      const review = await f.journal.prepare(user);
      await expect(f.journal.confirm(user, review, value)).rejects.toThrow(
        "warnings",
      );
      expect(
        f.send.mock.calls.filter((call) => call[0] === "confirm"),
      ).toHaveLength(0);
    },
  );
  it("does not confirm when the processor is unavailable", async () => {
    const f = fixture();
    const review = await f.journal.prepare(user);
    await expect(
      f.journal.confirm(user, { ...review, canConfirm: false }, explicit),
    ).rejects.toThrow("unavailable");
  });
  it("does not confirm an expired review", async () => {
    const f = fixture();
    const review = await f.journal.prepare(user);
    f.deps.now = () => now + 300_000;
    await expect(f.journal.confirm(user, review, explicit)).rejects.toThrow(
      "expired",
    );
  });
  it("keeps an uncertain confirmation pending when a racing status still says prepared", async () => {
    const f = fixture();
    const review = await f.journal.prepare(user);
    f.send.mockRejectedValueOnce(new Error("Interrupted"));
    await expect(f.journal.confirm(user, review, explicit)).rejects.toThrow(
      "Interrupted",
    );
    expect((await f.journal.refresh(user))?.phase).toBe("confirming");
    await f.journal.cancel(user);
    expect(
      f.send.mock.calls.filter((call) => call[0] === "cancel"),
    ).toHaveLength(0);
  });
  it("preserves a corrupt receipt instead of starting a second irreversible request", async () => {
    const f = fixture();
    await f.journal.prepare(user);
    const key = [...f.values.keys()][0];
    f.values.set(key, "broken");
    f.send.mockClear();
    await expect(f.journal.prepare(user)).rejects.toThrow("recovery");
    expect(f.send).not.toHaveBeenCalled();
    expect(f.values.get(key)).toBe("broken");
  });
  it("only starts a new request after a definitive cancellation", async () => {
    const f = fixture();
    const first = await f.journal.prepare(user);
    await f.journal.cancel(user);
    const next = await f.journal.prepare(user);
    expect(next.requestId).not.toBe(first.requestId);
  });
  it("serializes two screen instances against the same secure receipt", async () => {
    const f = fixture();
    const reopened = createDeletionJournal(f.deps);
    const [first, second] = await Promise.all([
      f.journal.prepare(user),
      reopened.prepare(user),
    ]);
    expect(first.requestId).toBe(second.requestId);
    await Promise.all([
      f.journal.confirm(user, first, explicit),
      reopened.confirm(user, second, explicit),
    ]);
    expect(
      f.send.mock.calls.filter((call) => call[0] === "confirm"),
    ).toHaveLength(1);
  });
  it.each(["", "{"])(
    "never treats an empty or corrupt stored receipt as absent",
    async (raw) => {
      const f = fixture();
      await f.journal.prepare(user);
      const key = [...f.values.keys()][0];
      f.values.set(key, raw);
      f.send.mockClear();
      await expect(f.journal.prepare(user)).rejects.toThrow("recovery");
      expect(f.send).not.toHaveBeenCalled();
      expect(f.values.get(key)).toBe(raw);
    },
  );
  it("rejects a corrupt phase that could otherwise replace an accepted request", async () => {
    const f = fixture();
    const review = await f.journal.prepare(user);
    await f.journal.confirm(user, review, explicit);
    const key = [...f.values.keys()][0],
      stored = JSON.parse(f.values.get(key)!);
    stored.phase = "expired";
    f.values.set(key, JSON.stringify(stored));
    f.send.mockClear();
    await expect(f.journal.prepare(user)).rejects.toThrow("recovery");
    expect(f.send).not.toHaveBeenCalled();
  });
});
