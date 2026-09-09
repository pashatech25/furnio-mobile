import { afterEach, describe, expect, it, vi } from "vitest";
import {
  drainAccountMediaPage,
  processAccountMediaCleanup,
} from "./account-media-cleanup";
import { NativeDatabase } from "./native-events";
import worker from "./index";

const user = "11111111-1111-4111-8111-111111111111";
const job = "22222222-2222-4222-8222-222222222222";
const scope = "33333333-3333-4333-8333-333333333333";
const clock = Date.parse("2026-09-09T09:00:00Z");
const lease = {
  scopeId: scope,
  requestId: job,
  userId: user,
  jobId: null,
  kind: "input",
  prefix: `in/${user}/`,
  leaseId: scope,
  leaseExpiresAt: new Date(clock + 120_000).toISOString(),
};
const bucket = () => ({
  list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
  delete: vi.fn().mockResolvedValue(undefined),
});
const env = {
  ENVIRONMENT: "staging",
  MOBILE_ACCOUNT_CLEANUP_ENABLED: "true",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture_not_real",
} as Env;
afterEach(() => vi.restoreAllMocks());
describe("account-scoped R2 cleanup", () => {
  it.each([
    ["input", null, `in/${user}/`],
    ["output", null, `out/${user}/`],
    ["mask", null, `tmp/masks/${user}/`],
    ["job", job, `tmp/${job}/`],
  ])(
    "uses the exact %s ownership prefix, without a cursor or delimiter",
    async (kind, jobId, prefix) => {
      const storage = bucket();
      expect(
        await drainAccountMediaPage(
          { ...lease, kind, jobId, prefix },
          storage as never,
          () => clock,
        ),
      ).toBe("empty");
      expect(storage.list).toHaveBeenCalledExactlyOnceWith({
        prefix,
        limit: 200,
      });
      expect(storage.delete).not.toHaveBeenCalled();
    },
  );
  it.each([
    { prefix: "" },
    { prefix: "/" },
    { prefix: "in/" },
    { prefix: `in/${job}/` },
    { prefix: `in/${user}` },
    { prefix: `in/${user}/../` },
    { kind: "job", jobId: null },
    { kind: "job", jobId: job, prefix: `tmp/${user}/` },
    { jobId: job },
    { userId: "../" },
  ])(
    "rejects malformed or unowned scope %j before storage access",
    async (override) => {
      const storage = bucket();
      expect(
        await drainAccountMediaPage(
          { ...lease, ...override },
          storage as never,
          () => clock,
        ),
      ).toBe("scope_mismatch");
      expect(storage.list).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    },
  );
  it("validates the entire page before any deletion", async () => {
    const storage = bucket();
    storage.list.mockResolvedValue({
      objects: [
        { key: lease.prefix + "original.jpg" },
        { key: `out/${job}/other.jpg` },
      ],
      truncated: false,
    });
    expect(
      await drainAccountMediaPage(lease, storage as never, () => clock),
    ).toBe("scope_mismatch");
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it("drains pages by re-listing the prefix, never advancing a deletion cursor", async () => {
    const storage = bucket();
    storage.list
      .mockResolvedValueOnce({
        objects: [{ key: lease.prefix + "a.jpg" }],
        truncated: true,
        cursor: "must-not-use",
      })
      .mockResolvedValueOnce({
        objects: [{ key: lease.prefix + "b.jpg" }],
        truncated: false,
      })
      .mockResolvedValueOnce({ objects: [], truncated: false });
    expect(
      await drainAccountMediaPage(lease, storage as never, () => clock),
    ).toBe("deleted_page");
    expect(
      await drainAccountMediaPage(lease, storage as never, () => clock),
    ).toBe("deleted_page");
    expect(
      await drainAccountMediaPage(lease, storage as never, () => clock),
    ).toBe("empty");
    expect(storage.list.mock.calls).toEqual(
      Array(3).fill([{ prefix: lease.prefix, limit: 200 }]),
    );
    expect(storage.delete.mock.calls).toEqual([
      [[lease.prefix + "a.jpg"]],
      [[lease.prefix + "b.jpg"]],
    ]);
  });
  it.each([
    { objects: [], truncated: true },
    { objects: [] },
    { objects: [], truncated: false, delimitedPrefixes: ["hidden-files"] },
    {
      objects: Array.from({ length: 201 }, () => ({
        key: lease.prefix + "file",
      })),
      truncated: false,
    },
  ])("never calls an ambiguous/malformed page empty", async (page) => {
    const storage = bucket();
    storage.list.mockResolvedValue(page);
    expect(
      await drainAccountMediaPage(lease, storage as never, () => clock),
    ).toBe("storage_unavailable");
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it.each([-1, 3_000, 1_000_000])(
    "does not use expired or implausible lease (%d ms)",
    async (duration) => {
      const storage = bucket();
      expect(
        await drainAccountMediaPage(
          {
            ...lease,
            leaseExpiresAt: new Date(clock + duration).toISOString(),
          },
          storage as never,
          () => clock,
        ),
      ).toBeNull();
      expect(storage.list).not.toHaveBeenCalled();
    },
  );
  it("rechecks lease after a slow list before deleting", async () => {
    const storage = bucket();
    let time = clock;
    storage.list.mockImplementation(async () => {
      time += 121_000;
      return { objects: [{ key: lease.prefix + "file" }], truncated: false };
    });
    expect(
      await drainAccountMediaPage(lease, storage as never, () => time),
    ).toBeNull();
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it("waits for deletion; ambiguous provider failure stays retriable and redacted", async () => {
    const storage = bucket();
    storage.list.mockResolvedValue({
      objects: [{ key: lease.prefix + "private.jpg" }],
      truncated: false,
    });
    storage.delete.mockRejectedValue(new Error("private provider data"));
    expect(
      await drainAccountMediaPage(lease, storage as never, () => clock),
    ).toBe("storage_unavailable");
  });
  it("acknowledges only a completed storage operation", async () => {
    const storage = bucket(),
      db = new NativeDatabase(env);
    const rpc = vi
      .spyOn(db, "rpc")
      .mockResolvedValueOnce(lease)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    let resolve!: () => void;
    storage.list.mockResolvedValue({
      objects: [{ key: lease.prefix + "file" }],
      truncated: false,
    });
    storage.delete.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const processing = processAccountMediaCleanup(
      { ...env, ACCOUNT_MEDIA: storage } as never,
      db,
      () => clock,
    );
    await vi.waitFor(() => expect(storage.delete).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledTimes(1);
    resolve();
    await processing;
    expect(rpc.mock.calls[1]!.slice(0, 2)).toEqual([
      "finish_mobile_account_media_cleanup",
      {
        p_environment: "SANDBOX",
        p_scope: scope,
        p_lease: scope,
        p_result: "deleted_page",
      },
    ]);
  });
  it("bounds each cron invocation to five scopes", async () => {
    const storage = bucket(),
      db = new NativeDatabase(env);
    const rpc = vi
      .spyOn(db, "rpc")
      .mockImplementation(async (method) =>
        method === "claim_mobile_account_media_cleanup" ? lease : null,
      );
    await processAccountMediaCleanup(
      { ...env, ACCOUNT_MEDIA: storage } as never,
      db,
      () => clock,
    );
    expect(storage.list).toHaveBeenCalledTimes(5);
    expect(rpc).toHaveBeenCalledTimes(10);
  });
  it("does nothing with the cleanup flag off, including with unconfigured credentials", async () => {
    const db = new NativeDatabase(env),
      rpc = vi.spyOn(db, "rpc");
    await processAccountMediaCleanup(
      { MOBILE_ACCOUNT_CLEANUP_ENABLED: "false" } as Env,
      db,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("stops at a failed acknowledgement; later leases can retry deletion safely", async () => {
    const storage = bucket(),
      db = new NativeDatabase(env);
    const rpc = vi
      .spyOn(db, "rpc")
      .mockResolvedValueOnce(lease)
      .mockRejectedValueOnce(new Error("ack failed"));
    await expect(
      processAccountMediaCleanup(
        { ...env, ACCOUNT_MEDIA: storage } as never,
        db,
        () => clock,
      ),
    ).rejects.toThrow("ack failed");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("never exposes a client-callable cleanup route", async () => {
    const result = await worker.fetch(
      new Request("https://mobile.test/v1/account/cleanup", { method: "POST" }),
      {
        ...env,
        MOBILE_ENABLED: "false",
      } as Env,
    );
    expect(result.status).not.toBe(200);
  });
});
