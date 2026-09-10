import { describe, expect, it, vi } from "vitest";
import { createApi } from "./client";
import { readWebsiteBilling } from "./website-billing";

const date = "2026-09-09T19:00:00+00:00";
const baseAccount = {
  balance: 50,
  subscription: null,
  recentTransactions: [],
  packages: [
    { name: "Not an in-app offer", checkoutUrl: "https://checkout.invalid" },
  ],
};
function fixture(account: unknown = baseAccount, status = 200) {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify(account), { status }),
  );
  return {
    fetcher,
    api: createApi(
      "https://customer.invalid",
      async () => "synthetic-token",
      fetcher,
    ),
  };
}

describe("existing website wallet adapter", () => {
  it("makes one authenticated read, without mobile billing capabilities or store offers", async () => {
    const { api, fetcher } = fixture();
    const result = await readWebsiteBilling(api);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "https://customer.invalid/api/billing",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer synthetic-token",
        },
      }),
    );
    expect(result).toEqual({
      balance: 50,
      subscription: null,
      subscriptions: [],
      acquisitionEnabled: false,
      products: [],
      transactions: [],
    });
    expect(JSON.stringify(result)).not.toContain("checkout");
  });

  it("keeps the recorded web subscription state and credit purchases, without recalculating balance", async () => {
    const { api } = fixture({
      ...baseAccount,
      balance: 17,
      subscription: {
        id: "sub_fixture",
        currentPlanName: "Furnio Pro",
        status: "past_due",
        currentPeriodEnd: date,
        cancelAtPeriodEnd: true,
      },
      recentTransactions: [
        { id: 43, credits: 50, reason: "subscription_grant", createdAt: date },
        { id: 42, credits: 100, reason: "purchase", createdAt: date },
      ],
    });
    const result = await readWebsiteBilling(api);
    expect(result.balance).toBe(17);
    expect(result.subscription).toMatchObject({
      provider: "stripe",
      name: "Furnio Pro",
      status: "past_due",
      cancelAtPeriodEnd: true,
    });
    expect(result.subscriptions).toEqual([result.subscription]);
    expect(
      result.transactions.map(({ id, label, credits }) => ({
        id,
        label,
        credits,
      })),
    ).toEqual([
      { id: "43", label: "Subscription credits", credits: 50 },
      { id: "42", label: "Credit pack", credits: 100 },
    ]);
  });

  it("does not expose an unknown raw ledger reason as a billing instruction", async () => {
    const { api } = fixture({
      ...baseAccount,
      recentTransactions: [
        {
          id: 1,
          credits: -5,
          reason: "unrecognized_internal_reason",
          createdAt: date,
        },
      ],
    });
    expect((await readWebsiteBilling(api)).transactions[0]).toMatchObject({
      provider: "furnio",
      credits: -5,
      label: "Credit adjustment",
    });
  });

  it("preserves a real zero balance without inventing a subscription", async () => {
    const { api } = fixture({ ...baseAccount, balance: 0 });
    expect(await readWebsiteBilling(api)).toMatchObject({
      balance: 0,
      subscription: null,
      products: [],
    });
  });

  it.each([
    { ...baseAccount, balance: "50" },
    { ...baseAccount, recentTransactions: undefined },
    { ...baseAccount, subscription: { id: "sub_fixture" } },
    {
      ...baseAccount,
      recentTransactions: [
        { id: 1, credits: 50, reason: "purchase", createdAt: "invalid" },
      ],
    },
  ])(
    "rejects malformed data rather than displaying a fake empty wallet",
    async (account) => {
      await expect(
        readWebsiteBilling(fixture(account).api),
      ).rejects.toMatchObject({ status: 502 });
    },
  );

  it.each([401, 403, 503])(
    "keeps server errors visible (%s)",
    async (status) => {
      await expect(
        readWebsiteBilling(fixture({ error: "Unavailable" }, status).api),
      ).rejects.toMatchObject({ status });
    },
  );
});
