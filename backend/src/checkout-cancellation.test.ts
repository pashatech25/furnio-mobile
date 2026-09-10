import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeDatabase } from "./native-events";
import { checkSdkCancellation } from "./checkout-cancellation";
import { purchaseIntent } from "./purchase-intents";
import { RevenueCatVerifier } from "./revenuecat";

const user = "00000000-0000-4000-8000-000000000001";
const intent = "00000000-0000-4000-8000-000000000002";
const lease = "00000000-0000-4000-8000-000000000003";
const launchedAt = "2026-09-09T12:00:00Z";
const config = {
  projectId: "proj_test",
  apiKey: "s".repeat(30),
  appIds: ["app_apple"],
};
// Only the validated native configuration/database transport is used here.
const env = {
  ENVIRONMENT: "staging",
  NATIVE_RECONCILIATION_ENABLED: "true",
  REVENUECAT_APP_IDS: "app_apple",
  REVENUECAT_PROJECT_ID: config.projectId,
  REVENUECAT_SECRET_API_KEY: config.apiKey,
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture",
} as Env;
const context = {
  userId: user,
  environment: "SANDBOX" as const,
  store: "APP_STORE" as const,
  kind: "consumable" as const,
  launchedAt,
};
const owner = {
  id: "rc_id",
  customer_id: user,
  original_customer_id: user,
  environment: "sandbox",
  store: "app_store",
  ownership: "purchased",
};
const purchase = {
  ...owner,
  product_id: "prod_pack",
  purchased_at: Date.parse(launchedAt) - 86400000,
  quantity: 1,
  status: "owned",
  store_purchase_identifier: "store_old",
};
const subscription = {
  ...owner,
  product_id: "prod_plan",
  current_period_ends_at: Date.parse(launchedAt) + 86400000,
  status: "active",
  gives_access: true,
  pending_payment: false,
  auto_renewal_status: "will_renew",
};
function provider(
  rows: {
    purchases?: unknown[];
    subscriptions?: unknown[];
    events?: unknown[];
  } = {},
) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (!url.pathname.startsWith(`/v2/projects/proj_test/customers/${user}/`))
      throw new Error("Wrong owner/origin path");
    const kind = url.pathname.split("/").at(-1);
    const items =
      kind === "purchases"
        ? (rows.purchases ?? [])
        : kind === "subscriptions"
          ? (rows.subscriptions ?? [])
          : (rows.events ?? []);
    return Response.json({ items, next_page: null });
  });
}
afterEach(() => vi.restoreAllMocks());
describe("SDK cancellation provider risk checks", () => {
  it("allows an empty complete snapshot without claiming or granting payment", async () => {
    const fetcher = provider();
    expect(
      await new RevenueCatVerifier(config, fetcher).hasCancellationConflict(
        context,
      ),
    ).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetcher.mock.calls) {
      expect(new URL(String(url)).origin).toBe("https://api.revenuecat.com");
      expect(options).toMatchObject({ method: "GET", redirect: "manual" });
    }
  });
  it("allows old consumables and an existing plan when cancelling only a new pack", async () => {
    expect(
      await new RevenueCatVerifier(
        config,
        provider({ purchases: [purchase], subscriptions: [subscription] }),
      ).hasCancellationConflict(context),
    ).toBe(false);
  });
  it.each([
    "active",
    "trialing",
    "in_grace_period",
    "in_billing_retry",
    "paused",
    "unknown",
  ])("holds an already-owned %s subscription", async (status) => {
    expect(
      await new RevenueCatVerifier(
        config,
        provider({ subscriptions: [{ ...subscription, status }] }),
      ).hasCancellationConflict({ ...context, kind: "subscription" }),
    ).toBe(true);
  });
  it.each(["owned", "refunded"])(
    "holds a recent %s purchase",
    async (status) => {
      expect(
        await new RevenueCatVerifier(
          config,
          provider({
            purchases: [
              { ...purchase, status, purchased_at: Date.parse(launchedAt) },
            ],
          }),
        ).hasCancellationConflict(context),
      ).toBe(true);
    },
  );
  it.each([
    { original_customer_id: intent },
    { customer_id: intent },
    { ownership: "family_shared" },
  ])("holds ambiguous ownership %j", async (extra) => {
    expect(
      await new RevenueCatVerifier(
        config,
        provider({ purchases: [{ ...purchase, ...extra }] }),
      ).hasCancellationConflict(context),
    ).toBe(true);
  });
  it("does not confuse a production payment with the sandbox checkout", async () => {
    expect(
      await new RevenueCatVerifier(
        config,
        provider({
          purchases: [
            {
              ...purchase,
              environment: "production",
              purchased_at: Date.parse(launchedAt),
            },
          ],
        }),
      ).hasCancellationConflict(context),
    ).toBe(false);
  });
  it("blocks a recent payment visible only in event history", async () => {
    const event = {
      id: "evt",
      type: "NON_RENEWING_PURCHASE",
      app_id: "app_apple",
      event_timestamp_ms: Date.parse(launchedAt),
      app_user_id: user,
      original_app_user_id: user,
      environment: "SANDBOX",
      store: "APP_STORE",
      product_id: "pack20",
      transaction_id: "store_new",
      original_transaction_id: "store_new",
      purchased_at_ms: Date.parse(launchedAt),
      expiration_at_ms: null,
      period_type: "NORMAL",
      is_family_share: false,
    };
    expect(
      await new RevenueCatVerifier(
        config,
        provider({
          events: [
            {
              object: "customer.event",
              id: "history_id",
              type: "PURCHASES_NON_RENEWING_PURCHASE",
              app_id: "app_apple",
              body: event,
              created_at: Date.parse(launchedAt),
            },
          ],
        }),
      ).hasCancellationConflict(context),
    ).toBe(true);
  });
  it.each([404, 429, 500])(
    "does not treat HTTP %i as no purchase",
    async (status) => {
      await expect(
        new RevenueCatVerifier(
          config,
          vi.fn(async () => new Response(null, { status })),
        ).hasCancellationConflict(context),
      ).rejects.toThrow();
    },
  );
  it("refuses pagination that could leak the provider secret", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ items: [], next_page: "https://evil.invalid/collect" }),
    );
    await expect(
      new RevenueCatVerifier(config, fetcher).hasCancellationConflict(context),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not mistake incompatible JSON for an empty history", async () => {
    await expect(
      new RevenueCatVerifier(
        config,
        provider({ purchases: [{ malformed: true }] }),
      ).hasCancellationConflict(context),
    ).rejects.toThrow();
  });
});
describe("owned, leased cancellation boundary", () => {
  const claim = {
    leaseId: lease,
    store: "APP_STORE",
    kind: "consumable",
    launchedAt,
  };
  it.each([true, false])(
    "records only the server check outcome (conflict=%s)",
    async (conflict) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(claim))
        .mockResolvedValueOnce(Response.json(!conflict));
      const verifier = { hasCancellationConflict: vi.fn(async () => conflict) };
      await checkSdkCancellation(
        user,
        intent,
        env,
        new NativeDatabase(env, fetcher),
        verifier,
      );
      expect(verifier.hasCancellationConflict).toHaveBeenCalledWith(context);
      expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
        p_user: user,
        p_intent: intent,
        p_environment: "SANDBOX",
        p_lease: lease,
        p_observation: conflict ? "conflict" : "clear_snapshot",
      });
    },
  );
  it("does no provider work when disabled, throttled or without an owned eligible lease", async () => {
    const fetcher = vi.fn(async () => Response.json(null));
    const verifier = { hasCancellationConflict: vi.fn() };
    await checkSdkCancellation(
      user,
      intent,
      env,
      new NativeDatabase(env, fetcher),
      verifier,
    );
    expect(verifier.hasCancellationConflict).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("records provider failure without secrets and cannot release", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(claim))
      .mockResolvedValueOnce(Response.json(false));
    await checkSdkCancellation(
      user,
      intent,
      env,
      new NativeDatabase(env, fetcher),
      {
        hasCancellationConflict: vi.fn(async () => {
          throw new Error("private provider credential/body");
        }),
      },
    );
    expect(
      JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)).p_observation,
    ).toBe("unavailable");
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(
      "private provider",
    );
  });
  it.each([
    { userId: intent },
    { environment: "PRODUCTION" },
    { outcome: "clear_snapshot" },
    { verified: true },
    { store: "STRIPE" },
  ])("rejects caller evidence %j", async (extra) => {
    const fetcher = vi.fn();
    await expect(
      purchaseIntent(
        new Request(`https://mobile.test/v1/purchases/intents/${intent}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "store_cancelled", ...extra }),
        }),
        user,
        intent,
        env,
        new NativeDatabase(env, fetcher),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("recovers a lost cancellation response from its exact terminal status without another check", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ intentId: intent, status: "cancelled" }),
    );
    expect(
      await purchaseIntent(
        new Request(`https://mobile.test/v1/purchases/intents/${intent}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "store_cancelled" }),
        }),
        user,
        intent,
        env,
        new NativeDatabase(env, fetcher),
      ),
    ).toEqual({ intentId: intent, status: "cancelled" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
