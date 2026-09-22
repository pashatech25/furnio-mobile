import { describe, expect, it, vi } from "vitest";
import { nativeCommerceReadiness, NativeDatabase } from "./native-events";
import { getMobileBilling } from "./billing";
import { purchaseEligibility, purchaseIntent } from "./purchase-intents";

function configured(): Env {
  return {
    ENVIRONMENT: "staging",
    MOBILE_ENABLED: "true",
    MOBILE_BILLING_READ_ENABLED: "true",
    NATIVE_RECONCILIATION_ENABLED: "true",
    NATIVE_ACQUISITION_ENABLED: "true",
    SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_only",
    REVENUECAT_PROJECT_ID: "project_fixture",
    REVENUECAT_APP_IDS: "app_fixture",
    REVENUECAT_SECRET_API_KEY: "fixture-api-key-not-a-real-secret",
    REVENUECAT_WEBHOOK_AUTHORIZATION: "fixture-authorization-not-a-real-secret",
    REVENUECAT_WEBHOOK_SIGNING_SECRET: "fixture-signing-key-not-a-real-secret",
    NATIVE_EVENTS: { send: vi.fn(), sendBatch: vi.fn(), metrics: vi.fn() },
  } as Env;
}

describe("commerce deployment readiness", () => {
  it("permits acquisition only when verification and delivery are configured", () => {
    expect(nativeCommerceReadiness(configured())).toEqual({ recoveryReady: true, commerceReady: true });
  });
  it.each(["MOBILE_ENABLED", "MOBILE_BILLING_READ_ENABLED", "NATIVE_ACQUISITION_ENABLED"] as const)(
    "keeps recovery available when %s is disabled", (key) => {
      expect(nativeCommerceReadiness({ ...configured(), [key]: "false" })).toEqual({ recoveryReady: true, commerceReady: false });
    },
  );
  it.each(["REVENUECAT_PROJECT_ID", "REVENUECAT_APP_IDS", "REVENUECAT_SECRET_API_KEY", "REVENUECAT_WEBHOOK_AUTHORIZATION", "REVENUECAT_WEBHOOK_SIGNING_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PROJECT_REF"] as const)(
    "fails closed without %s", (key) => {
      expect(nativeCommerceReadiness({ ...configured(), [key]: "" })).toEqual({ recoveryReady: false, commerceReady: false });
    },
  );
  it("rejects a staging configuration targeting production", () => {
    expect(nativeCommerceReadiness({ ...configured(), SUPABASE_PROJECT_REF: "sgsjkgfwgxmlqcgyuyeh", SUPABASE_URL: "https://sgsjkgfwgxmlqcgyuyeh.supabase.co" }).commerceReady).toBe(false);
  });
  it("requires the database acquisition switch in addition to deployment readiness", async () => {
    const snapshot = {balance: 50, subscription: null, subscriptions: [], subscriptionConflict: false, products: [], transactions: [], acquisitionEnabled: false};
    const spy = vi.spyOn(NativeDatabase.prototype, "rpc").mockResolvedValue(snapshot);
    try {
      expect((await getMobileBilling("owner", new URL("https://mobile.test/v1/billing?store=APP_STORE"), configured())).acquisitionEnabled).toBe(false);
      spy.mockResolvedValue({...snapshot, acquisitionEnabled: true});
      expect((await getMobileBilling("owner", new URL("https://mobile.test/v1/billing?store=APP_STORE"), configured())).acquisitionEnabled).toBe(true);
      expect((await getMobileBilling("owner", new URL("https://mobile.test/v1/billing?store=PLAY_STORE"), configured())).acquisitionEnabled).toBe(false);
    } finally { spy.mockRestore(); }
  });
  it("rejects Android checkout and launch before any database request", async () => {
    const env = configured();
    const id = "00000000-0000-4000-8000-000000000001";
    const spy = vi.spyOn(NativeDatabase.prototype, "rpc");
    const request = (body: unknown) => new Request("https://mobile.test/v1/purchases/eligibility", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
    try {
      await expect(purchaseEligibility(request({store: "PLAY_STORE", productId: "pack", requestId: id}), id, env)).rejects.toMatchObject({status: 503});
      await expect(purchaseIntent(request({action: "launch", store: "PLAY_STORE"}), id, id, env)).rejects.toMatchObject({status: 503});
      expect(spy).not.toHaveBeenCalled();
    } finally {spy.mockRestore();}
  });
});
