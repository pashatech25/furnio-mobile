import { afterEach, describe, expect, it, vi } from "vitest";
import { RevenueCatVerifier } from "./revenuecat";
import { normalizeHistoryEntry, eventPageCursor } from "./recovery-history";
import { NativeDatabase, processNativeEvent } from "./native-events";
import { processRecovery, requestRecovery } from "./recovery";
import worker from "./index";

const user = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";
const leaseId = "00000000-0000-4000-8000-000000000003";
const stamp = 1788928800000;
const entry = {
  object: "customer.event" as const,
  id: "event_1",
  type: "PURCHASES_INITIAL_PURCHASE",
  app_id: "app_apple",
  created_at: stamp,
  body: {
    app_user_id: user,
    original_app_user_id: user,
    event_timestamp_ms: stamp,
    environment: "SANDBOX",
    store: "APP_STORE",
    product_id: "monthly50",
    transaction_id: "txn1",
    original_transaction_id: "orig1",
    purchased_at_ms: stamp - 1000,
    expiration_at_ms: stamp + 86400000,
    period_type: "NORMAL",
    is_family_share: false,
    subscriber_attributes: { email: "must-not-persist@example.invalid" },
  },
};
const env = () =>
  ({
    ENVIRONMENT: "staging",
    MOBILE_ENABLED: "false",
    NATIVE_RECONCILIATION_ENABLED: "true",
    SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture",
    REVENUECAT_PROJECT_ID: "proj1",
    REVENUECAT_APP_IDS: "app_apple",
    REVENUECAT_SECRET_API_KEY: "sk_" + "x".repeat(40),
    NATIVE_EVENTS: {
      send: vi.fn(async () => undefined),
      sendBatch: vi.fn(async () => undefined),
    },
    PLATFORM: {
      fetch: vi.fn(async () => Response.json({ user: { userId: user } })),
      connect: vi.fn(),
    },
  }) as unknown as Env;
const http = (body: unknown = {}, method = "POST") =>
  new Request("https://mobile.invalid/v1/purchases/reconcile", {
    method,
    headers: {
      Authorization: "Bearer only-an-auth-fixture-token",
      "Content-Type": "application/json",
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
afterEach(() => vi.restoreAllMocks());
describe("server-derived RevenueCat recovery history", () => {
  it("normalizes documented event metadata, hashes stable IDs and strips private fields", async () => {
    const a = await normalizeHistoryEntry(entry, user, "SANDBOX", [
      "app_apple",
    ]);
    const b = await normalizeHistoryEntry(
      {
        ...entry,
        body: { ...entry.body, subscriber_attributes: { phone: "private" } },
      },
      user,
      "SANDBOX",
      ["app_apple"],
    );
    expect(a).toEqual(b);
    expect(a).toMatchObject({
      event: {
        id: expect.stringMatching(/^rc-recovery:[a-f0-9]{64}$/),
        type: "INITIAL_PURCHASE",
        app_user_id: user,
      },
      bodyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(a)).not.toContain("must-not-persist");
  });
  it.each([
    { app_user_id: runId },
    { original_app_user_id: runId },
    { is_family_share: true },
    { aliases: [runId] },
    { environment: "PRODUCTION" },
    { store: "STRIPE" },
    { app_id: "other-app" },
    { type: "RENEWAL" },
    { transaction_id: undefined },
    { period_type: undefined },
  ])(
    "does not manufacture a grant from incomplete or mismatched fields %j",
    async (change) => {
      expect(
        await normalizeHistoryEntry(
          { ...entry, body: { ...entry.body, ...change } },
          user,
          "SANDBOX",
          ["app_apple"],
        ),
      ).toBe("review");
    },
  );
  it("marks transfers for review, ignores unrelated application metadata", async () => {
    expect(
      await normalizeHistoryEntry(
        { ...entry, type: "PURCHASES_TRANSFER" },
        user,
        "SANDBOX",
        ["app_apple"],
      ),
    ).toBe("review");
    expect(
      await normalizeHistoryEntry(
        { ...entry, type: "CUSTOMER_ATTRIBUTE_UPDATED" },
        user,
        "SANDBOX",
        ["app_apple"],
      ),
    ).toBe("ignored");
    expect(
      await normalizeHistoryEntry(
        { ...entry, app_id: "not-furnio" },
        user,
        "SANDBOX",
        ["app_apple"],
      ),
    ).toBe("ignored");
  });
  it.each([
    "https://attacker.invalid/v2/projects/proj1/customers/x/events?starting_after=1",
    "/v2/projects/proj1/customers/other/events?starting_after=1",
    "/v2/projects/proj1/customers/x/events?starting_after=1&starting_after=2",
    "/v2/projects/proj1/customers/x/events?starting_after=1&token=private",
    "/v2/projects/proj1/customers/x/events#fragment",
  ])("rejects unsafe provider pagination %s", (next) =>
    expect(() =>
      eventPageCursor(next, "/v2/projects/proj1/customers/x/events"),
    ).toThrow(),
  );
  it("requests one bounded page for the authenticated UUID and forced environment", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        items: [entry],
        next_page: `/v2/projects/proj1/customers/${user}/events?starting_after=evt2`,
      }),
    );
    const client = new RevenueCatVerifier(
      { projectId: "proj1", apiKey: "x".repeat(30), appIds: ["app_apple"] },
      fetcher,
    );
    const page = await client.customerEventPage(user, "SANDBOX", null);
    expect(page.nextCursor).toBe("evt2");
    expect(page.events).toHaveLength(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `https://api.revenuecat.com/v2/projects/proj1/customers/${user}/events?environment=sandbox&limit=20`,
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "error",
    });
  });
});
describe("durable authenticated restore", () => {
  it("works while acquisition is off and exposes no coordinator/lease identifiers", async () => {
    const config = env();
    const rpc = vi
      .spyOn(NativeDatabase.prototype, "rpc")
      .mockResolvedValue({
        runId,
        enqueue: true,
        status: "pending",
        checkedAt: null,
      });
    const response = await worker.fetch(http(), config);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      status: "pending",
      checkedAt: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      "begin_native_purchase_recovery",
      { p_user: user, p_environment: "SANDBOX" },
      expect.anything(),
    );
    expect(config.NATIVE_EVENTS.send).toHaveBeenCalledWith(
      { recoveryId: runId },
      { contentType: "json" },
    );
  });
  it.each([
    { userId: runId },
    { transactionId: "owned-by-someone-else" },
    { credits: 500 },
    { cursor: "x" },
    [],
  ])("rejects client claims %j", async (body) => {
    const rpc = vi.spyOn(NativeDatabase.prototype, "rpc");
    expect((await worker.fetch(http(body), env())).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects absent auth, disabled reconciliation and browser-origin access", async () => {
    const rpc = vi.spyOn(NativeDatabase.prototype, "rpc");
    const unauthorized = http();
    unauthorized.headers.delete("Authorization");
    expect((await worker.fetch(unauthorized, env())).status).toBe(401);
    expect(
      (
        await worker.fetch(http(), {
          ...env(),
          NATIVE_RECONCILIATION_ENABLED: "false",
        })
      ).status,
    ).toBe(503);
    const browser = http();
    browser.headers.set("Origin", "https://foreign.invalid");
    expect((await worker.fetch(browser, env())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not repeatedly enqueue a cooldown response or a status poll", async () => {
    const config = env();
    vi.spyOn(NativeDatabase.prototype, "rpc").mockResolvedValue({
      runId,
      enqueue: false,
      status: "pending",
      checkedAt: null,
    });
    await requestRecovery(http(), user, config);
    await requestRecovery(http({}, "GET"), user, config);
    expect(config.NATIVE_EVENTS.send).not.toHaveBeenCalled();
  });
  it("does not acknowledge recovery when queue acceptance fails", async () => {
    const config = env();
    vi.spyOn(NativeDatabase.prototype, "rpc").mockResolvedValue({
      runId,
      enqueue: true,
      status: "pending",
      checkedAt: null,
    });
    vi.mocked(config.NATIVE_EVENTS.send).mockRejectedValue(
      new Error("queue unreachable"),
    );
    expect((await worker.fetch(http(), config)).status).toBe(502);
  });
  it("durably saves history and cursor before queueing a continuation, without granting", async () => {
    const config = env();
    const order: string[] = [];
    const rpc = vi
      .spyOn(NativeDatabase.prototype, "rpc")
      .mockResolvedValueOnce({
        userId: user,
        environment: "SANDBOX",
        phase: "discovering",
        cursor: null,
        leaseId,
        eventIds: [],
      })
      .mockImplementationOnce(async () => {
        order.push("save");
        return null;
      });
    vi.spyOn(
      RevenueCatVerifier.prototype,
      "customerEventPage",
    ).mockResolvedValue({ events: [], nextCursor: "page2", issues: 0 });
    vi.mocked(config.NATIVE_EVENTS.send).mockImplementation(async () => {
      order.push("queue");
    });
    await processRecovery(runId, config);
    expect(order).toEqual(["save", "queue"]);
    expect(rpc.mock.calls[1]?.slice(0, 2)).toEqual([
      "save_native_recovery_page",
      {
        p_run: runId,
        p_lease: leaseId,
        p_events: [],
        p_next_cursor: "page2",
        p_issues: 0,
      },
    ]);
    expect(
      rpc.mock.calls.some(([name]) => name === "apply_verified_native_event"),
    ).toBe(false);
  });
  it("never advances dispatch after a failed queue batch", async () => {
    const config = env();
    const rpc = vi
      .spyOn(NativeDatabase.prototype, "rpc")
      .mockResolvedValue({
        userId: user,
        environment: "SANDBOX",
        phase: "dispatching",
        cursor: null,
        leaseId,
        eventIds: ["event1"],
      });
    vi.mocked(config.NATIVE_EVENTS.sendBatch).mockRejectedValue(
      new Error("queue unreachable"),
    );
    await expect(processRecovery(runId, config)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not verify or grant events until full discovery finishes", async () => {
    vi.spyOn(NativeDatabase.prototype, "rpc").mockResolvedValue({
      state: "pending",
      event: {},
      kind: "subscription",
      recoveryReady: false,
    });
    const verifier = vi.spyOn(RevenueCatVerifier.prototype, "verify");
    await expect(processNativeEvent("e", env())).rejects.toMatchObject({
      status: 503,
    });
    expect(verifier).not.toHaveBeenCalled();
  });
});
