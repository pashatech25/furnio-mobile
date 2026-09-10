import { describe, expect, it, vi } from "vitest";
import {
  createSubmissionJournal,
  type ReceiptStorage,
  type SubmissionReceipt,
} from "./submission-journal";
import {
  lookupSubmission,
  submitWithReceipt,
  submissionRecoverySchema,
  acknowledgeViewedSubmission,
} from "./submission-recovery";
import { ApiError, createApi } from "../api/client";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const receipt: SubmissionReceipt = {
  version: 1,
  id: id(1),
  userId: id(2),
  scope: "a".repeat(64),
  projectId: id(3),
  service: "virtual_staging",
  startedAt: 100,
  sourceIds: [id(4)],
  referenceIds: [],
  anchorId: null,
};
function fixture() {
  const data = new Map<string, string>();
  const storage: ReceiptStorage = {
    getItem: vi.fn(async (key) => data.get(key) ?? null),
    setItem: vi.fn(async (key, value) => {
      data.set(key, value);
    }),
    removeItem: vi.fn(async (key) => {
      data.delete(key);
    }),
  };
  return { data, storage, journal: createSubmissionJournal(storage) };
}
describe("durable Studio submission receipt", () => {
  it.each([
    "match",
    "other-job",
    "missing",
    "changed-account",
    "cleanup-failed",
  ])(
    "only acknowledges an actually viewed matching job (%s)",
    async (variant) => {
      const f = fixture();
      await f.journal.claim(receipt);
      let current = true;
      if (variant === "cleanup-failed")
        vi.mocked(f.storage.removeItem).mockRejectedValue(
          new Error("device locked"),
        );
      const api = createApi(
        "https://api.invalid",
        async () => "fixture",
        async () => {
          if (variant === "changed-account") current = false;
          return Response.json(
            variant === "missing"
              ? { state: "not_found" }
              : { state: "found", jobId: id(5), status: "running" },
          );
        },
      );
      const result = acknowledgeViewedSubmission({
        journal: f.journal,
        api,
        scope: receipt.scope,
        userId: receipt.userId,
        jobId: variant === "other-job" ? id(9) : id(5),
        assertCurrent: () => {
          if (!current) throw new Error("account changed");
        },
      });
      if (variant === "changed-account" || variant === "cleanup-failed")
        await expect(result).rejects.toThrow();
      else await result;
      expect(await f.journal.load(receipt.scope, receipt.userId)).toEqual(
        variant === "match" ? null : receipt,
      );
    },
  );
  it("survives a new journal instance with only minimal account/environment-scoped identifiers", async () => {
    const f = fixture();
    await f.journal.claim(receipt);
    expect(
      await createSubmissionJournal(f.storage).load(
        receipt.scope,
        receipt.userId,
      ),
    ).toEqual(receipt);
    expect(await f.journal.load("b".repeat(64), receipt.userId)).toBeNull();
    expect(await f.journal.load(receipt.scope, id(9))).toBeNull();
    const raw = [...f.data.values()][0]!;
    expect(new TextEncoder().encode(raw).length).toBeLessThan(1800);
    expect(raw).not.toMatch(/https|prompt|token|photo|uri|base64/);
  });
  it.each([
    "",
    "null",
    "{}",
    "{",
    "x".repeat(2000),
    JSON.stringify({ ...receipt, userId: id(99) }),
    JSON.stringify({ ...receipt, scope: "b".repeat(64) }),
  ])("fails closed without deleting a damaged record (%s)", async (raw) => {
    const f = fixture();
    await f.journal.claim(receipt);
    const key = [...f.data.keys()][0]!;
    f.data.set(key, raw);
    await expect(
      f.journal.load(receipt.scope, receipt.userId),
    ).rejects.toThrow();
    await expect(f.journal.claim(receipt)).rejects.toThrow();
    expect(f.data.get(key)).toBe(raw);
  });
  it("rejects unknown sensitive fields rather than persisting them", async () => {
    const f = fixture();
    await expect(
      f.journal.claim({ ...receipt, token: "secret" } as SubmissionReceipt),
    ).rejects.toThrow();
    expect(f.data.size).toBe(0);
  });
  it("permits only one concurrent claim and cannot delete a newer receipt", async () => {
    const f = fixture();
    const second = { ...receipt, id: id(8) };
    const results = await Promise.allSettled([
      f.journal.claim(receipt),
      f.journal.claim(second),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    await f.journal.clear(receipt);
    await f.journal.claim(second);
    await expect(f.journal.clear(receipt)).rejects.toThrow();
    expect(await f.journal.load(receipt.scope, receipt.userId)).toEqual(second);
  });
  it.each(["read", "write", "verify"])(
    "does not dispatch on %s storage failure",
    async (kind) => {
      const f = fixture();
      const send = vi.fn(async () => "job");
      if (kind === "read")
        vi.mocked(f.storage.getItem).mockRejectedValue(new Error("locked"));
      if (kind === "write")
        vi.mocked(f.storage.setItem).mockRejectedValue(new Error("full"));
      if (kind === "verify")
        vi.mocked(f.storage.setItem).mockResolvedValue(undefined);
      await expect(
        submitWithReceipt({
          journal: f.journal,
          receipt,
          assertCurrent: () => undefined,
          send,
        }),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    },
  );
  it("writes and verifies before dispatch and retains the receipt through successful navigation", async () => {
    const f = fixture();
    vi.mocked(f.storage.removeItem).mockRejectedValue(new Error("full"));
    const send = vi.fn(async (onDispatch: () => void) => {
      expect(await f.journal.load(receipt.scope, receipt.userId)).toEqual(
        receipt,
      );
      onDispatch();
      return "job-id";
    });
    expect(
      await submitWithReceipt({
        journal: f.journal,
        receipt,
        assertCurrent: () => undefined,
        send,
      }),
    ).toBe("job-id");
    expect(send).toHaveBeenCalledTimes(1);
    expect(await f.journal.load(receipt.scope, receipt.userId)).toEqual(
      receipt,
    );
  });
  it.each([
    new ApiError("lost", 0, true),
    new ApiError("timeout", 502, true),
    new ApiError("late conflict", 409),
    new Error("signout"),
  ])("keeps the receipt after an uncertain dispatch", async (error) => {
    const f = fixture();
    const send = vi.fn(async (onDispatch: () => void) => {
      onDispatch();
      throw error;
    });
    await expect(
      submitWithReceipt({
        journal: f.journal,
        receipt,
        assertCurrent: () => undefined,
        send,
      }),
    ).rejects.toThrow();
    expect(await f.journal.load(receipt.scope, receipt.userId)).toEqual(
      receipt,
    );
    await expect(
      submitWithReceipt({
        journal: f.journal,
        receipt,
        assertCurrent: () => undefined,
        send,
      }),
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("releases a receipt only for a known before-work rejection or before dispatch cancellation", async () => {
    const f = fixture();
    const send = vi.fn(async (onDispatch: () => void) => {
      onDispatch();
      throw new ApiError("changed", 409, false, "CREDIT_QUOTE_CHANGED");
    });
    await expect(
      submitWithReceipt({
        journal: f.journal,
        receipt,
        assertCurrent: () => undefined,
        send,
      }),
    ).rejects.toThrow();
    expect(await f.journal.load(receipt.scope, receipt.userId)).toBeNull();
    let checks = 0;
    await expect(
      submitWithReceipt({
        journal: f.journal,
        receipt,
        assertCurrent: () => {
          if (++checks === 2) throw new Error("signed out");
        },
        send,
      }),
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await f.journal.load(receipt.scope, receipt.userId)).toBeNull();
  });
  it.each(["not_found", "needs_review", "found"])(
    "performs only the read-only %s lookup; never clears or replays",
    async (state) => {
      const f = fixture();
      await f.journal.claim(receipt);
      const fetcher = vi.fn<typeof fetch>(async () =>
        Response.json(
          state === "found"
            ? { state, jobId: id(5), status: "queued" }
            : { state },
        ),
      );
      const api = createApi(
        "https://api.invalid",
        async () => "fixture-token",
        fetcher,
      );
      expect((await lookupSubmission(api, receipt)).state).toBe(state);
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, request] = fetcher.mock.calls[0]!;
      expect(url).toBe("https://api.invalid/api/mobile/v1/submissions/recover");
      expect(JSON.parse(String(request?.body))).toEqual({
        projectId: id(3),
        service: "virtual_staging",
        sourceIds: [id(4)],
        referenceIds: [],
        anchorId: null,
      });
      expect(await f.journal.load(receipt.scope, receipt.userId)).toEqual(
        receipt,
      );
    },
  );
  it.each(["token", "cancelled", "encoding"])(
    "clears when %s fails before the HTTP request can dispatch",
    async (kind) => {
      const f = fixture();
      const controller = new AbortController();
      const fetcher = vi.fn<typeof fetch>();
      const api = createApi(
        "https://api.invalid",
        async () => {
          if (kind === "token") throw new Error("session expired");
          if (kind === "cancelled") controller.abort();
          return "fixture";
        },
        fetcher,
      );
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      await expect(
        submitWithReceipt({
          journal: f.journal,
          receipt,
          assertCurrent: () => undefined,
          send: (onDispatch) =>
            api(
              "/api/mobile/v1/jobs/stage",
              submissionRecoverySchema,
              kind === "encoding" ? circular : {},
              { onDispatch, expectedCredits: 5, signal: controller.signal },
            ),
        }),
      ).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
      expect(await f.journal.load(receipt.scope, receipt.userId)).toBeNull();
    },
  );
});
