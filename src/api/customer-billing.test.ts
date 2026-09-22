import { describe, expect, it, vi } from "vitest";
import { createApi } from "./client";
import { readCustomerBilling } from "./customer-billing";

function client(response: unknown, status = 200) {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(response), { status }));
  return { api: createApi("https://fixture.invalid", async () => "fixture", fetcher), fetcher };
}
const websiteSnapshot = { balance: 12, subscription: null, recentTransactions: [] };
const capabilities = { version: 1, commerceReady: false, billingReady: true, accountDeletionReady: false, notificationsReady: false };
describe("customer wallet source", () => {
  it("uses the complete native-aware balance without adding the web balance", async () => {
    const web = client(websiteSnapshot);
    const snapshot = { balance: 62, subscription: null, subscriptions: [], products: [], transactions: [
      { id: "native-1", provider: "app_store", credits: 50, label: "Apple credits", createdAt: "2026-09-15T00:00:00Z" },
    ] };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).includes("capabilities") ? capabilities : snapshot)));
    const mobile = createApi("https://fixture.invalid", async () => "fixture", fetcher);
    const result = await readCustomerBilling(web.api, mobile, true);
    expect(result).toEqual(snapshot);
    expect(web.fetcher).not.toHaveBeenCalled();
    expect(String(fetcher.mock.calls[1][0])).toContain("/v1/billing?store=APP_STORE");
  });
  it("preserves the old wallet when the server explicitly disables native billing", async () => {
    const web = client(websiteSnapshot), mobile = client({ ...capabilities, billingReady: false });
    expect((await readCustomerBilling(web.api, mobile.api, true)).balance).toBe(12);
  });
  it("keeps Android and unconfigured builds on the existing web API", async () => {
    const web = client(websiteSnapshot), mobile = client({});
    expect((await readCustomerBilling(web.api, mobile.api, false)).balance).toBe(12);
    expect(mobile.fetcher).not.toHaveBeenCalled();
  });
  it("surfaces unavailable native reads instead of silently showing stale provider data", async () => {
    const web = client(websiteSnapshot), mobile = client({}, 503);
    await expect(readCustomerBilling(web.api, mobile.api, true)).rejects.toThrow();
    expect(web.fetcher).not.toHaveBeenCalled();
  });
});
