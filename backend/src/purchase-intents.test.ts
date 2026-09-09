import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import { NativeDatabase } from "./native-events";
import {
  purchaseEligibility,
  purchaseIntent,
  recoverPurchaseSelection,
} from "./purchase-intents";
const user = "00000000-0000-4000-8000-000000000001";
const intent = "00000000-0000-4000-8000-000000000002";
function environment(): Env {
  return {
    ENVIRONMENT: "staging",
    MOBILE_ENABLED: "true",
    NATIVE_ACQUISITION_ENABLED: "true",
    NATIVE_RECONCILIATION_ENABLED: "true",
    MOBILE_BILLING_READ_ENABLED: "false",
    MOBILE_ACTIVITY_READ_ENABLED: "false",
    TURNSTILE_SITE_KEY: "",
    CHALLENGE_HOSTNAME: "",
    SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture",
    REVENUECAT_PROJECT_ID: "proj_fixture",
    REVENUECAT_APP_IDS: "app_apple",
    REVENUECAT_SECRET_API_KEY: "",
    REVENUECAT_WEBHOOK_AUTHORIZATION: "",
    REVENUECAT_WEBHOOK_SIGNING_SECRET: "",
    NATIVE_EVENTS: { send: vi.fn(), sendBatch: vi.fn(), metrics: vi.fn() },
    PLATFORM: {
      fetch: vi.fn(async () => Response.json({ user: { userId: user } })),
      connect: () => {
        throw new Error("unused");
      },
    },
  };
}
function request(
  body: unknown,
  path = "/v1/purchases/eligibility",
  method = "POST",
) {
  return new Request(`https://mobile.test${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer fixture-token-long-enough",
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}
const selection = {
  productId: "pack20",
  store: "APP_STORE",
  requestId: intent,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("native purchase intent boundary", () => {
  it("recovers only the authenticated customer's request in the configured store environment", async () => {
    const env = {
      ...environment(),
      MOBILE_ENABLED: "false",
      NATIVE_ACQUISITION_ENABLED: "false",
    };
    const fetcher = vi.fn(async () =>
      Response.json({
        intentId: intent,
        status: "cancelled",
        secret: "stripped",
      }),
    );
    const result = await recoverPurchaseSelection(
      request({ store: "APP_STORE", requestId: intent }),
      user,
      env,
      new NativeDatabase(env, fetcher),
    );
    expect(result).toEqual({ intentId: intent, status: "cancelled" });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      p_user: user,
      p_environment: "SANDBOX",
      p_provider: "APP_STORE",
      p_request: intent,
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "/rpc/recover_native_purchase_selection",
    );
  });
  it("serves selection recovery during acquisition rollback without opening checkout", async () => {
    const env = {
      ...environment(),
      MOBILE_ENABLED: "false",
      NATIVE_ACQUISITION_ENABLED: "false",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ intentId: null, status: "not_found" })),
    );
    const response = await worker.fetch(
      request(
        { store: "APP_STORE", requestId: intent },
        "/v1/purchases/recover-selection",
      ),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      intentId: null,
      status: "not_found",
    });
  });
  it("refuses another user's selection claims and Stripe cancellation", async () => {
    const env = environment(),
      fetcher = vi.fn();
    for (const body of [
      { store: "STRIPE", requestId: intent },
      { store: "APP_STORE", requestId: intent, userId: intent },
    ]) {
      await expect(
        recoverPurchaseSelection(
          request(body),
          user,
          env,
          new NativeDatabase(env, fetcher),
        ),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses only authenticated UUID, configured environment and an immutable selection fingerprint", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        enabled: true,
        allowed: true,
        intentId: intent,
        expiresAt: "2026-09-09T08:00:00Z",
      }),
    );
    const env = environment();
    await purchaseEligibility(
      request(selection),
      user,
      env,
      new NativeDatabase(env, fetcher),
    );
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      p_user: user,
      p_environment: "SANDBOX",
      p_provider: "APP_STORE",
      p_product: "pack20",
      p_request: intent,
      p_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it.each([
    { userId: intent },
    { credits: 999 },
    { price: 0 },
    { environment: "PRODUCTION" },
    { masterPrompt: "bypass" },
  ])("rejects extra client payment claims %j", async (extra) => {
    const env = environment(),
      fetcher = vi.fn();
    await expect(
      purchaseEligibility(
        request({ ...selection, ...extra }),
        user,
        env,
        new NativeDatabase(env, fetcher),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("strips internal Stripe session references from a blocked native response", async () => {
    const env = environment();
    const database = new NativeDatabase(
      env,
      vi.fn(async () =>
        Response.json({
          enabled: true,
          allowed: false,
          reason: "purchase_pending",
          stripeSessionId: "cs_private",
          provider: "STRIPE",
          intentId: intent,
        }),
      ),
    );
    expect(
      await purchaseEligibility(request(selection), user, env, database),
    ).toEqual({ enabled: true, allowed: false, reason: "purchase_pending" });
  });
  it("keeps status available while mobile acquisition is disabled", async () => {
    const env = {
      ...environment(),
      MOBILE_ENABLED: "false",
      NATIVE_ACQUISITION_ENABLED: "false",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ intentId: intent, status: "pending" })),
    );
    expect(
      (
        await worker.fetch(
          request(undefined, `/v1/purchases/intents/${intent}`, "GET"),
          env,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await worker.fetch(
          request(
            { action: "launch", store: "APP_STORE" },
            `/v1/purchases/intents/${intent}`,
          ),
          env,
        )
      ).status,
    ).toBe(503);
  });
  it("cannot replay a launched sheet", async () => {
    const env = environment(),
      database = new NativeDatabase(
        env,
        vi.fn(async () => Response.json(false)),
      );
    await expect(
      purchaseIntent(
        request({ action: "launch", store: "APP_STORE" }),
        user,
        intent,
        env,
        database,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("reports only a transaction lookup hint, never a receipt or payment amount", async () => {
    const env = environment(),
      fetcher = vi.fn(async () =>
        Response.json({ intentId: intent, status: "pending" }),
      );
    await purchaseIntent(
      request({ action: "report", transactionId: "txn_lookup" }),
      user,
      intent,
      env,
      new NativeDatabase(env, fetcher),
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      p_user: user,
      p_environment: "SANDBOX",
      p_intent: intent,
      p_transaction_hint: "txn_lookup",
    });
  });
  it("still requires customer authentication for recovery", async () => {
    const env = environment();
    const response = await worker.fetch(
      new Request(`https://mobile.test/v1/purchases/intents/${intent}`),
      env,
    );
    expect(response.status).toBe(401);
    expect(env.PLATFORM.fetch).not.toHaveBeenCalled();
  });
  it("rejects oversized purchase bodies and query overrides", async () => {
    const env = environment(),
      database = new NativeDatabase(env, vi.fn());
    await expect(
      purchaseEligibility(
        request({ ...selection, productId: "x".repeat(3000) }),
        user,
        env,
        database,
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      purchaseIntent(
        request(null, `/v1/purchases/intents/${intent}?user=other`, "GET"),
        user,
        intent,
        env,
        database,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
