import { afterEach, describe, it, expect, vi } from "vitest";
import worker from "./index";
import { NativeDatabase } from "./native-events";
const userId = "00000000-0000-4000-8000-000000000001";
const env = {
  ENVIRONMENT: "staging",
  MOBILE_ENABLED: "true",
  MOBILE_BILLING_READ_ENABLED: "true",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  PLATFORM: { fetch: async () => Response.json({ user: { userId } }) },
} as unknown as Env;
const snapshot = {
  balance: 50,
  subscription: null,
  subscriptions: [],
  subscriptionConflict: false,
  products: [],
  transactions: [],
  acquisitionEnabled: true,
};
afterEach(() => vi.restoreAllMocks());
describe("mobile billing reads", () => {
  it("uses verified customer ID and requested device store, not query-supplied ownership", async () => {
    const rpc = vi
      .spyOn(NativeDatabase.prototype, "rpc")
      .mockResolvedValue(snapshot);
    const response = await worker.fetch(
      new Request(
        "https://mobile.invalid/v1/billing?store=APP_STORE&userId=other",
        {
          headers: {
            Authorization: "Bearer fixture-with-at-least-20-characters",
          },
        },
      ),
      env,
    );
    expect(response.status).toBe(200);
    expect(rpc.mock.calls[0]?.slice(0, 2)).toEqual([
      "get_mobile_billing_snapshot",
      { p_user: userId, p_environment: "SANDBOX", p_store: "APP_STORE" },
    ]);
    expect(await response.json()).toMatchObject({
      balance: 50,
      acquisitionEnabled: false,
    });
  });
  it("rejects missing store rather than showing an arbitrary storefront", async () => {
    const rpc = vi.spyOn(NativeDatabase.prototype, "rpc");
    const response = await worker.fetch(
      new Request("https://mobile.invalid/v1/billing", {
        headers: {
          Authorization: "Bearer fixture-with-at-least-20-characters",
        },
      }),
      env,
    );
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("never reports native purchases ready just because billing read access is enabled", async () => {
    const response = await worker.fetch(
      new Request("https://mobile.invalid/v1/capabilities"),
      env,
    );
    expect(await response.json()).toMatchObject({
      billingReady: true,
      commerceReady: false,
    });
  });
  it("can disable billing reads independently without changing shared balances", async () => {
    const rpc = vi.spyOn(NativeDatabase.prototype, "rpc");
    const response = await worker.fetch(
      new Request("https://mobile.invalid/v1/billing?store=PLAY_STORE", {
        headers: {
          Authorization: "Bearer fixture-with-at-least-20-characters",
        },
      }),
      { ...env, MOBILE_BILLING_READ_ENABLED: "false" },
    );
    expect(response.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
});
