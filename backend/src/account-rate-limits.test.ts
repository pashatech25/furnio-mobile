import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  accountPrivacyLimitsReady,
  beginAccountPrivacyLimits,
} from "./account-rate-limits";
import { accountPrivacyLimitFixture } from "../tests/account-rate-limit-fixture";

const ip = "192.0.2.1";
const user = "a2222222-2222-4222-8222-222222222222";
const receipt = "a3333333-3333-4333-8333-333333333333";
const secret = "b8".repeat(32);
function request(address = ip) {
  return new Request("https://mobile.test/v1/account/deletion/status", {
    headers: { "CF-Connecting-IP": address },
  });
}
function environment() {
  return { ENVIRONMENT: "staging", ...accountPrivacyLimitFixture() };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("private account-request counters", () => {
  it("uses a scoped HMAC, never raw addresses, account IDs, request IDs or receipt secrets", async () => {
    const env = environment();
    const source = vi.spyOn(env.ACCOUNT_DELETION_SOURCE_LIMIT, "limit");
    const account = vi.spyOn(env.ACCOUNT_DELETION_USER_LIMIT, "limit");
    const capability = vi.spyOn(env.ACCOUNT_DELETION_RECEIPT_LIMIT, "limit");
    const limits = await beginAccountPrivacyLimits(request(), env);
    await limits.user(user);
    await limits.receipt(receipt, secret);
    const expectedKey = (scope: string, ids: string[]) =>
      createHmac(
        "sha256",
        Buffer.from(env.ACCOUNT_DELETION_LIMIT_SECRET, "hex"),
      )
        .update(
          JSON.stringify([
            "furnio-mobile-account-privacy-v1",
            "staging",
            scope,
            ...ids,
          ]),
        )
        .digest("hex");
    expect(source).toHaveBeenCalledExactlyOnceWith({
      key: expectedKey("source", [ip]),
    });
    expect(account).toHaveBeenCalledExactlyOnceWith({
      key: expectedKey("user", [user]),
    });
    expect(capability).toHaveBeenCalledExactlyOnceWith({
      key: expectedKey("receipt", [receipt, secret]),
    });
    const recorded = JSON.stringify([
      source.mock.calls,
      account.mock.calls,
      capability.mock.calls,
    ]);
    for (const privateValue of [
      ip,
      user,
      receipt,
      secret,
      env.ACCOUNT_DELETION_LIMIT_SECRET,
    ])
      expect(recorded).not.toContain(privateValue);
  });

  it.each([
    ["2001:db8::1", "2001:0DB8:0:0:0:0:0:1"],
    ["192.0.2.1", "::ffff:192.0.2.1"],
    ["192.0.2.1", "0:0:0:0:0:ffff:c000:201"],
  ])(
    "normalizes equivalent source addresses %s and %s",
    async (first, second) => {
      const env = environment();
      const source = vi.spyOn(env.ACCOUNT_DELETION_SOURCE_LIMIT, "limit");
      await beginAccountPrivacyLimits(request(first), env);
      await beginAccountPrivacyLimits(request(second), env);
      expect(source.mock.calls[0]).toEqual(source.mock.calls[1]);
    },
  );

  it.each([
    "",
    "192.0.2.1,192.0.2.2",
    "unknown",
    "999.1.1.1",
    "2001:db8::1%lo",
    "[2001:db8::1]",
    "127.1",
    "0x7f000001",
  ])(
    "fails closed for invalid/missing source %s and never trusts alternate headers",
    async (address) => {
      const env = environment();
      const source = vi.spyOn(env.ACCOUNT_DELETION_SOURCE_LIMIT, "limit");
      const req = request(address);
      req.headers.set("X-Forwarded-For", ip);
      req.headers.set("X-Real-IP", ip);
      await expect(beginAccountPrivacyLimits(req, env)).rejects.toMatchObject({
        status: 503,
      });
      expect(source).not.toHaveBeenCalled();
    },
  );

  it("does not change counters when a caller spoofs other source headers", async () => {
    const env = environment();
    const source = vi.spyOn(env.ACCOUNT_DELETION_SOURCE_LIMIT, "limit");
    const req = request();
    await beginAccountPrivacyLimits(req, env);
    req.headers.set("X-Forwarded-For", "192.0.2.99");
    await beginAccountPrivacyLimits(req, env);
    expect(source.mock.calls[0]).toEqual(source.mock.calls[1]);
  });

  it.each([
    { ACCOUNT_DELETION_LIMIT_SECRET: undefined },
    { ACCOUNT_DELETION_LIMIT_SECRET: "short" },
    { ACCOUNT_DELETION_LIMIT_SECRET: "x".repeat(64) },
    { ACCOUNT_DELETION_LIMIT_SECRET: "a7".repeat(32) + "\n" },
    { ACCOUNT_DELETION_SOURCE_LIMIT: undefined },
    { ACCOUNT_DELETION_USER_LIMIT: undefined },
    { ACCOUNT_DELETION_RECEIPT_LIMIT: { limit: "not callable" } },
    { ENVIRONMENT: "unknown" },
  ])(
    "cannot advertise or bypass incomplete rate-limit configuration",
    async (override) => {
      const env = { ...environment(), ...override };
      expect(accountPrivacyLimitsReady(env)).toBe(false);
      await expect(
        beginAccountPrivacyLimits(request(), env),
      ).rejects.toMatchObject({ status: 503 });
    },
  );

  it("isolates environments, secret rotation, accounts, and the complete receipt capability", async () => {
    const env = environment();
    const source = vi.spyOn(env.ACCOUNT_DELETION_SOURCE_LIMIT, "limit");
    const account = vi.spyOn(env.ACCOUNT_DELETION_USER_LIMIT, "limit");
    const capability = vi.spyOn(env.ACCOUNT_DELETION_RECEIPT_LIMIT, "limit");
    const limits = await beginAccountPrivacyLimits(request(), env);
    await limits.user(user);
    await limits.user(user.toUpperCase());
    await limits.user(receipt);
    expect(account.mock.calls[0]).toEqual(account.mock.calls[1]);
    expect(account.mock.calls[0]).not.toEqual(account.mock.calls[2]);
    await limits.receipt(receipt, secret);
    await limits.receipt(receipt.toUpperCase(), secret);
    await limits.receipt(receipt, "c9".repeat(32));
    await limits.receipt(user, secret);
    expect(capability.mock.calls[0]).toEqual(capability.mock.calls[1]);
    expect(capability.mock.calls[0]).not.toEqual(capability.mock.calls[2]);
    expect(capability.mock.calls[0]).not.toEqual(capability.mock.calls[3]);
    await beginAccountPrivacyLimits(request(), {
      ...env,
      ENVIRONMENT: "production",
    });
    await beginAccountPrivacyLimits(request(), {
      ...env,
      ACCOUNT_DELETION_LIMIT_SECRET: "d1".repeat(32),
    });
    expect(
      new Set(source.mock.calls.map(([options]) => options.key)).size,
    ).toBe(3);
  });

  it.each(["source", "user", "receipt"] as const)(
    "rejects a denied %s counter",
    async (stage) => {
      const env = environment();
      const binding =
        stage === "source"
          ? env.ACCOUNT_DELETION_SOURCE_LIMIT
          : stage === "user"
            ? env.ACCOUNT_DELETION_USER_LIMIT
            : env.ACCOUNT_DELETION_RECEIPT_LIMIT;
      vi.spyOn(binding, "limit").mockResolvedValue({ success: false });
      await expect(
        (async () => {
          const limits = await beginAccountPrivacyLimits(request(), env);
          if (stage === "user") await limits.user(user);
          if (stage === "receipt") await limits.receipt(receipt, secret);
        })(),
      ).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    },
  );

  it.each([undefined, null, {}, { success: "true" }])(
    "fails closed for malformed limiter results",
    async (result) => {
      const env = environment();
      vi.spyOn(env.ACCOUNT_DELETION_SOURCE_LIMIT, "limit").mockResolvedValue(
        result,
      );
      await expect(
        beginAccountPrivacyLimits(request(), env),
      ).rejects.toMatchObject({ status: 503 });
    },
  );

  it("redacts limiter failures", async () => {
    const env = environment();
    vi.spyOn(env.ACCOUNT_DELETION_SOURCE_LIMIT, "limit").mockRejectedValue(
      new Error(`${ip} ${secret}`),
    );
    await expect(
      beginAccountPrivacyLimits(request(), env),
    ).rejects.toMatchObject({
      status: 503,
      message:
        "Account privacy service is temporarily unavailable. Please try again later.",
    });
  });

  it("bounds a hung limiter and does not continue after late completion", async () => {
    vi.useFakeTimers();
    const env = environment();
    let complete: (value: { success: boolean }) => void;
    const limit = vi
      .spyOn(env.ACCOUNT_DELETION_SOURCE_LIMIT, "limit")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
    const rejected = expect(
      beginAccountPrivacyLimits(request(), env),
    ).rejects.toMatchObject({ status: 503 });
    await vi.waitFor(() => expect(limit).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    complete!({ success: true });
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
});
