import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blockAccountSignIn,
  processAccountAuthBlocks,
} from "./account-auth-block";
import { NativeDatabase } from "./native-events";
import worker from "./index";

const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const clock = Date.parse("2026-09-09T10:00:00Z");
const lease = {
  requestId: otherId,
  userId,
  action: "block_sign_in",
  leaseId: otherId,
  leaseExpiresAt: new Date(clock + 120_000).toISOString(),
};
const env = {
  ENVIRONMENT: "staging",
  MOBILE_ACCOUNT_CLEANUP_ENABLED: "true",
  MOBILE_ACCOUNT_AUTH_BLOCK_ENABLED: "true",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture_not_real",
} as Env;
const banned = { id: userId, banned_until: "2126-01-01T00:00:00Z" };
const response = (data: unknown) => Response.json(data);
afterEach(() => vi.restoreAllMocks());

describe("supported Auth sign-in blocking, not account deletion", () => {
  it("blocks the exact leased UUID, reads it back, and never sends another change", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: userId }))
      .mockResolvedValueOnce(response(banned))
      .mockResolvedValueOnce(response(banned));
    expect(await blockAccountSignIn(lease, env, fetcher, () => clock)).toBe(
      "blocked",
    );
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual([
      "GET",
      "PUT",
      "GET",
    ]);
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toBe(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`);
      expect(options).toMatchObject({
        redirect: "manual",
        cache: "no-store",
      });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(options?.headers).toMatchObject({
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      });
    }
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      ban_duration: "876000h",
    });
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });
  it("recovers a lost successful PUT by observing the existing long ban without rewriting it", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(banned));
    expect(await blockAccountSignIn(lease, env, fetcher, () => clock)).toBe(
      "blocked",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    "MOBILE_ACCOUNT_CLEANUP_ENABLED",
    "MOBILE_ACCOUNT_AUTH_BLOCK_ENABLED",
  ])("does nothing with %s disabled", async (key) => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      await blockAccountSignIn(
        lease,
        { ...env, [key]: "false" },
        fetcher,
        () => clock,
      ),
    ).toBeNull();
    await processAccountAuthBlocks(
      { ...env, [key]: "false" },
      undefined,
      fetcher,
      () => clock,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { ...lease, userId: "../other-account" },
    { ...lease, action: "delete" },
    { ...lease, email: "someone@example.invalid" },
  ])("rejects a malformed/expanded lease before I/O", async (input) => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await blockAccountSignIn(input, env, fetcher, () => clock)).toBe(
      "identity_mismatch",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([0, 4_999, 126_000])(
    "rejects expired or excessive lease lifetime %s",
    async (time) => {
      const fetcher = vi.fn<typeof fetch>();
      expect(
        await blockAccountSignIn(
          { ...lease, leaseExpiresAt: new Date(clock + time).toISOString() },
          env,
          fetcher,
          () => clock,
        ),
      ).toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...env, SUPABASE_URL: "https://other.example.invalid" },
    {
      ...env,
      SUPABASE_PROJECT_REF: "sgsjkgfwgxmlqcgyuyeh",
      SUPABASE_URL: "https://sgsjkgfwgxmlqcgyuyeh.supabase.co",
    },
    { ...env, ENVIRONMENT: "unknown" },
    { ...env, SUPABASE_SERVICE_ROLE_KEY: "" },
  ])(
    "rejects wrong/production origin or bad credentials before network access",
    async (config) => {
      const fetcher = vi.fn<typeof fetch>();
      expect(
        await blockAccountSignIn(lease, config, fetcher, () => clock),
      ).toBe("auth_unavailable");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each([
    { id: otherId },
    { id: userId, deleted_at: "2026-09-01T00:00:00Z" },
  ])("does not ban another/deleted identity", async (identity) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(identity));
    expect(await blockAccountSignIn(lease, env, fetcher, () => clock)).toBe(
      "identity_mismatch",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not accept a wrong identity returned by the PUT", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: userId }))
      .mockResolvedValueOnce(response({ ...banned, id: otherId }));
    expect(await blockAccountSignIn(lease, env, fetcher, () => clock)).toBe(
      "identity_mismatch",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("requires a persisted long ban on read-back", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: userId }))
      .mockResolvedValueOnce(response(banned))
      .mockResolvedValueOnce(
        response({ id: userId, banned_until: "2026-10-01T00:00:00Z" }),
      );
    expect(await blockAccountSignIn(lease, env, fetcher, () => clock)).toBe(
      "auth_unavailable",
    );
  });
  it.each([301, 401, 404, 429, 500])(
    "fails closed on HTTP %s without using/logging the body",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("private provider details", { status }),
        );
      expect(await blockAccountSignIn(lease, env, fetcher, () => clock)).toBe(
        "auth_unavailable",
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("bounds metadata and redacts parse/transport failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ ...banned, user_metadata: "x".repeat(33_000) }),
      );
    expect(await blockAccountSignIn(lease, env, fetcher, () => clock)).toBe(
      "auth_unavailable",
    );
    fetcher.mockRejectedValueOnce(
      new Error("secret credential and personal data"),
    );
    expect(await blockAccountSignIn(lease, env, fetcher, () => clock)).toBe(
      "auth_unavailable",
    );
  });
  it("does not write after an initial read outlives the lease", async () => {
    let current = clock;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      current += 120_000;
      return response({ id: userId });
    });
    expect(
      await blockAccountSignIn(lease, env, fetcher, () => current),
    ).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not acknowledge a write/read-back which outlives the lease", async () => {
    let current = clock;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: userId }))
      .mockImplementationOnce(async () => {
        current += 120_000;
        return response(banned);
      });
    expect(
      await blockAccountSignIn(lease, env, fetcher, () => current),
    ).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("awaits supported Auth and then the independent database checkpoint", async () => {
    const database = new NativeDatabase(env);
    const rpc = vi
      .spyOn(database, "rpc")
      .mockResolvedValueOnce(lease)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(null);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(banned));
    await processAccountAuthBlocks(env, database, fetcher, () => clock);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "claim_mobile_account_auth_block",
      "finish_mobile_account_auth_block",
      "claim_mobile_account_auth_block",
    ]);
    expect(rpc.mock.calls[1][1]).toEqual({
      p_environment: "SANDBOX",
      p_request: lease.requestId,
      p_lease: lease.leaseId,
      p_result: "blocked",
    });
  });
  it("stops on independent DB verification failure", async () => {
    const database = new NativeDatabase(env);
    const rpc = vi
      .spyOn(database, "rpc")
      .mockResolvedValueOnce(lease)
      .mockResolvedValueOnce(false);
    await processAccountAuthBlocks(
      env,
      database,
      vi.fn<typeof fetch>().mockResolvedValue(response(banned)),
      () => clock,
    );
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("bounds one cron invocation to five identities", async () => {
    const database = new NativeDatabase(env);
    const rpc = vi
      .spyOn(database, "rpc")
      .mockImplementation(async (method) =>
        method === "claim_mobile_account_auth_block" ? lease : true,
      );
    await processAccountAuthBlocks(
      env,
      database,
      vi.fn<typeof fetch>().mockImplementation(async () => response(banned)),
      () => clock,
    );
    expect(rpc).toHaveBeenCalledTimes(10);
  });
  it("keeps the processor off and exposes no public Auth-block route", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network"));
    const result = await worker.fetch(
      new Request("https://mobile.example.invalid/v1/account/auth-block", {
        method: "POST",
      }),
      env,
      {} as ExecutionContext,
    );
    expect(result.status).not.toBe(200);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
