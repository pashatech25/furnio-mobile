import { describe, it, expect, vi } from "vitest";
import { verifyWebhook, type NativeEvent } from "./revenuecat-webhook";
import { RevenueCatVerifier } from "./revenuecat";

const user = "00000000-0000-4000-8000-000000000001",
  now = 1788928800000;
const webhookConfig = {
  authorization: "Bearer " + "x".repeat(40),
  signingSecret: "s".repeat(40),
  appIds: ["app_apple"],
  environment: "SANDBOX" as const,
};
const base: NativeEvent = {
  id: "evt_1",
  type: "NON_RENEWING_PURCHASE",
  app_id: "app_apple",
  event_timestamp_ms: now,
  app_user_id: user,
  original_app_user_id: user,
  aliases: [user],
  environment: "SANDBOX",
  store: "APP_STORE",
  product_id: "pack20",
  transaction_id: "store_1",
  original_transaction_id: "store_1",
  purchased_at_ms: now - 1000,
  expiration_at_ms: null,
  period_type: "NORMAL",
  is_family_share: false,
  currency: "CAD",
  price_in_purchased_currency: 29.99,
  quantity: 1,
};
async function signedRequest(
  event: unknown = base,
  options: {
    body?: string;
    timestamp?: number;
    authorization?: string;
    signature?: string;
  } = {},
) {
  const body = options.body ?? JSON.stringify({ api_version: "1.0", event });
  const t = Math.floor((options.timestamp ?? now) / 1000);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(webhookConfig.signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${t}.${body}`),
  );
  const hex = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return new Request("https://mobile.example.invalid/v1/webhooks/revenuecat", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      Authorization: options.authorization ?? webhookConfig.authorization,
      "X-RevenueCat-Webhook-Signature": options.signature ?? `t=${t},v1=${hex}`,
    },
  });
}
describe("RevenueCat webhook authenticity and isolation", () => {
  it("verifies exact raw bytes and strips subscriber attributes before persistence", async () => {
    const response = await verifyWebhook(
      await signedRequest({
        ...base,
        subscriber_attributes: { $email: { value: "private@example.invalid" } },
        extra: "café",
      }),
      webhookConfig,
      now,
    );
    expect(response.event).toEqual(base);
    expect(response.bodyHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects incorrect bearer even with a valid HMAC", async () => {
    await expect(
      verifyWebhook(
        await signedRequest(base, { authorization: "Bearer wrong" }),
        webhookConfig,
        now,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects tampered body/signature", async () => {
    await expect(
      verifyWebhook(
        await signedRequest(base, {
          signature: `t=${now / 1000},v1=${"a".repeat(64)}`,
        }),
        webhookConfig,
        now,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects stale delivery timestamps, not old event dates on a freshly signed retry", async () => {
    await expect(
      verifyWebhook(
        await signedRequest(base, { timestamp: now - 301000 }),
        webhookConfig,
        now,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      verifyWebhook(
        await signedRequest({ ...base, event_timestamp_ms: now - 86400000 }),
        webhookConfig,
        now,
      ),
    ).resolves.toBeTruthy();
  });
  it.each([
    { environment: "PRODUCTION" },
    { app_id: "another_app" },
    { store: "STRIPE" },
  ])("rejects other environment/app/provider %j", async (change) => {
    await expect(
      verifyWebhook(
        await signedRequest({ ...base, ...change }),
        webhookConfig,
        now,
      ),
    ).rejects.toBeTruthy();
  });
  it.each([
    { is_family_share: true },
    { original_app_user_id: "00000000-0000-4000-8000-000000000002" },
    { aliases: ["00000000-0000-4000-8000-000000000002"] },
  ])("never grants across ambiguous purchase identities %j", async (change) => {
    await expect(
      verifyWebhook(
        await signedRequest({ ...base, ...change }),
        webhookConfig,
        now,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects oversized signed bodies", async () => {
    await expect(
      verifyWebhook(
        await signedRequest({ ...base, attributes: "x".repeat(140000) }),
        webhookConfig,
        now,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});

const owner = {
  id: "rc_1",
  customer_id: user,
  original_customer_id: user,
  environment: "sandbox",
  store: "app_store",
  ownership: "purchased",
};
const storePurchase = {
  ...owner,
  product_id: "prod1",
  purchased_at: now - 1000,
  quantity: 1,
  status: "owned",
  store_purchase_identifier: "store_1",
};
const storeProduct = {
  id: "prod1",
  store_identifier: "pack20",
  app_id: "app_apple",
  type: "one_time",
};
function history(event: Partial<NativeEvent> = {}) {
  const body = {
    ...base,
    type: "CANCELLATION",
    cancel_reason: "CUSTOMER_SUPPORT",
    ...event,
  };
  return {
    object: "customer.event",
    id: `history-${body.type}-${body.event_timestamp_ms}`,
    type: `PURCHASES_${body.type}`,
    app_id: body.app_id,
    body,
    created_at: body.event_timestamp_ms,
  };
}
function verifier(responses: unknown[]) {
  const mock = vi.fn<typeof fetch>(async () =>
    Response.json(responses.shift()),
  );
  return {
    mock,
    client: new RevenueCatVerifier(
      {
        projectId: "proj1",
        apiKey: "sk_" + "x".repeat(30),
        appIds: ["app_apple"],
      },
      mock,
    ),
  };
}
describe("independent RevenueCat API verification", () => {
  it("verifies an Apple reversal against both the owned purchase and independent refund history", async () => {
    const reverse = {
      ...base,
      type: "REFUND_REVERSED",
      event_timestamp_ms: now + 1000,
    };
    const { client, mock } = verifier([
      { items: [storePurchase] },
      storeProduct,
      { items: [history(), history(reverse)] },
    ]);
    expect(await client.verify(reverse, "consumable")).toMatchObject({
      grant: true,
      refund: false,
      refundState: {
        refunded: false,
        revisionMs: now + 1000,
        evidenceId: expect.stringMatching(/^rc-recovery:[a-f0-9]{64}$/),
      },
    });
    expect(String(mock.mock.calls[2]?.[0])).toContain(
      `/customers/${user}/events?environment=sandbox&limit=100`,
    );
  });
  it("does not use a stale consumable status to restore credits", async () => {
    const reverse = {
      ...base,
      type: "REFUND_REVERSED",
      event_timestamp_ms: now + 1000,
    };
    const { client } = verifier([
      { items: [{ ...storePurchase, status: "refunded" }] },
      storeProduct,
      { items: [history(reverse)] },
    ]);
    await expect(client.verify(reverse, "consumable")).rejects.toMatchObject({
      status: 503,
    });
  });
  it("a delayed refund resolves to the later verified reversal, not a second deduction", async () => {
    const { client } = verifier([
      { items: [storePurchase] },
      storeProduct,
      {
        items: [
          history(),
          history({ type: "REFUND_REVERSED", event_timestamp_ms: now + 1000 }),
        ],
      },
    ]);
    expect(
      await client.verify(
        { ...base, type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" },
        "consumable",
      ),
    ).toMatchObject({ refund: false, refundState: { revisionMs: now + 1000 } });
  });
  it("a delayed reversal resolves to a newer refund", async () => {
    const reverse = {
      ...base,
      type: "REFUND_REVERSED",
      event_timestamp_ms: now + 1000,
    };
    const { client } = verifier([
      { items: [{ ...storePurchase, status: "refunded" }] },
      storeProduct,
      {
        items: [history(reverse), history({ event_timestamp_ms: now + 2000 })],
      },
    ]);
    expect(await client.verify(reverse, "consumable")).toMatchObject({
      refund: true,
      refundState: { revisionMs: now + 2000 },
    });
  });
  it("follows every history page before permitting a restoration", async () => {
    const reverse = {
      ...base,
      type: "REFUND_REVERSED",
      event_timestamp_ms: now + 1000,
    };
    const { client, mock } = verifier([
      { items: [storePurchase] },
      storeProduct,
      {
        items: [history(reverse)],
        next_page: `/v2/projects/proj1/customers/${user}/events?starting_after=page1`,
      },
      { items: [history({ event_timestamp_ms: now + 2000 })] },
    ]);
    expect(await client.verify(reverse, "consumable")).toMatchObject({
      refund: true,
    });
    expect(mock).toHaveBeenCalledTimes(4);
  });
  it("does not restore from a signed reversal missing from independent server history", async () => {
    const { client } = verifier([
      { items: [storePurchase] },
      storeProduct,
      { items: [history()] },
    ]);
    await expect(
      client.verify({ ...base, type: "REFUND_REVERSED" }, "consumable"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    { store: "PLAY_STORE" as const },
    { period_type: "TRIAL" as const },
  ])(
    "rejects unsupported reversal %j before network access",
    async (change) => {
      const { client, mock } = verifier([]);
      await expect(
        client.verify(
          { ...base, type: "REFUND_REVERSED", ...change },
          "subscription",
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(mock).not.toHaveBeenCalled();
    },
  );
  it("verifies a refunded historical subscription period even when the current subscription is expired", async () => {
    const reverse = {
      ...base,
      type: "REFUND_REVERSED",
      product_id: "monthly50",
      event_timestamp_ms: now + 1000,
      expiration_at_ms: now + 3600000,
    };
    const { client } = verifier([
      {
        items: [
          {
            ...owner,
            id: "sub1",
            product_id: "prod1",
            status: "expired",
            current_period_ends_at: now + 3600000,
            gives_access: false,
            pending_payment: false,
            auto_renewal_status: "will_not_renew",
          },
        ],
      },
      {
        items: [
          {
            id: "store_1",
            product_store_identifier: "monthly50",
            purchased_at: now - 1000,
            expiration_date: now + 3600000,
          },
        ],
      },
      { ...storeProduct, store_identifier: "monthly50", type: "subscription" },
      { items: [history(reverse)] },
    ]);
    expect(await client.verify(reverse, "subscription")).toMatchObject({
      grant: true,
      refund: false,
      purchase: { familyId: "rc-subscription:sub1" },
      subscription: { status: "expired", cancelAtPeriodEnd: true },
    });
  });
  it("does not expose consumable credits when authenticated refund history precedes the purchase status refresh", async () => {
    const { client } = verifier([
      { items: [storePurchase], next_page: null },
      storeProduct,
      { items: [history()], next_page: null },
    ]);
    expect(
      await client.verify(base, "consumable", { refundKnown: true }),
    ).toMatchObject({ grant: true, refund: true });
  });
  it("atomically recovers a historical subscription grant when its later refund is already known", async () => {
    const { client } = verifier([
      {
        items: [
          {
            ...owner,
            id: "sub1",
            product_id: "prod1",
            status: "expired",
            current_period_ends_at: now + 86400000,
            gives_access: false,
            pending_payment: false,
            auto_renewal_status: "will_not_renew",
          },
        ],
        next_page: null,
      },
      {
        items: [
          {
            id: "store_1",
            product_store_identifier: "monthly50",
            purchased_at: now - 1000,
            expiration_date: now + 3600000,
          },
        ],
        next_page: null,
      },
      { ...storeProduct, store_identifier: "monthly50", type: "subscription" },
      {
        items: [
          history({ product_id: "monthly50", expiration_at_ms: now + 3600000 }),
        ],
        next_page: null,
      },
    ]);
    expect(
      await client.verify(
        {
          ...base,
          type: "INITIAL_PURCHASE",
          product_id: "monthly50",
          expiration_at_ms: now + 3600000,
        },
        "subscription",
        { refundKnown: true },
      ),
    ).toMatchObject({
      grant: true,
      refund: true,
      subscription: { status: "expired" },
    });
  });
  it("grants only the independently matched store transaction and product", async () => {
    const { client, mock } = verifier([
      { items: [storePurchase], next_page: null },
      storeProduct,
    ]);
    const result = await client.verify(base, "consumable");
    expect(result.purchase).toMatchObject({
      userId: user,
      productId: "pack20",
      priceAmount: 29.99,
      currency: "CAD",
      familyId: "rc-purchase:rc_1",
    });
    expect(result.grant).toBe(true);
    expect(result.refund).toBe(false);
    expect(String(mock.mock.calls[0]?.[0])).toBe(
      "https://api.revenuecat.com/v2/projects/proj1/purchases?store_purchase_identifier=store_1",
    );
    expect(mock.mock.calls[0]?.[1]?.redirect).toBe("error");
  });
  it("prepares refunded purchases for atomic grant-and-recovery, not spendable credit", async () => {
    const { client } = verifier([
      { items: [{ ...storePurchase, status: "refunded" }], next_page: null },
      storeProduct,
      { items: [history()], next_page: null },
    ]);
    expect(await client.verify(base, "consumable")).toMatchObject({
      grant: true,
      refund: true,
    });
  });
  it.each([
    { customer_id: "other" },
    { original_customer_id: "other" },
    { ownership: "family_shared" },
    { quantity: 2 },
  ])("rejects an ownership or quantity mismatch %j", async (change) => {
    const { client } = verifier([
      { items: [{ ...storePurchase, ...change }], next_page: null },
    ]);
    await expect(client.verify(base, "consumable")).rejects.toMatchObject({
      status: 409,
    });
  });
  it("rejects remapped product or app identifiers", async () => {
    const { client } = verifier([
      { items: [storePurchase], next_page: null },
      { ...storeProduct, app_id: "unapproved" },
    ]);
    await expect(client.verify(base, "consumable")).rejects.toMatchObject({
      status: 409,
    });
  });
  it("never sends the server secret to malicious pagination destinations", async () => {
    const { client, mock } = verifier([
      {
        items: [],
        next_page: "https://attacker.invalid/v2/projects/proj1/purchases",
      },
    ]);
    await expect(client.verify(base, "consumable")).rejects.toMatchObject({
      status: 502,
    });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("does not grant from dashboard TEST events", async () => {
    const { client, mock } = verifier([]);
    await expect(
      client.verify({ ...base, type: "TEST" }, "consumable"),
    ).rejects.toMatchObject({ status: 409 });
    expect(mock).not.toHaveBeenCalled();
  });
  it("verifies a delayed renewal against transaction history and current cancellation state", async () => {
    const { client } = verifier([
      {
        items: [
          {
            ...owner,
            id: "sub1",
            product_id: "prod1",
            status: "active",
            current_period_ends_at: now + 86400000,
            gives_access: true,
            pending_payment: false,
            auto_renewal_status: "will_not_renew",
          },
        ],
        next_page: null,
      },
      {
        items: [
          {
            id: "store_1",
            product_store_identifier: "monthly50",
            purchased_at: now - 1000,
            expiration_date: now + 3600000,
          },
        ],
        next_page: null,
      },
      { ...storeProduct, store_identifier: "monthly50", type: "subscription" },
    ]);
    const result = await client.verify(
      {
        ...base,
        type: "RENEWAL",
        product_id: "monthly50",
        expiration_at_ms: now + 3600000,
      },
      "subscription",
    );
    expect(result.purchase.familyId).toBe("rc-subscription:sub1");
    expect(result.subscription).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: true,
    });
    expect(result.grant).toBe(true);
  });
  it.each(["BILLING_ISSUE", "EXPIRATION", "UNCANCELLATION"])(
    "does not treat %s as a paid renewal",
    async (type) => {
      const { client } = verifier([
        {
          items: [
            {
              ...owner,
              id: "sub1",
              product_id: "prod1",
              status: "in_billing_retry",
              current_period_ends_at: now + 86400000,
              gives_access: false,
              pending_payment: true,
              auto_renewal_status: "will_renew",
            },
          ],
          next_page: null,
        },
        {
          items: [
            {
              id: "store_1",
              product_store_identifier: "monthly50",
              purchased_at: now - 1000,
              expiration_date: now + 3600000,
            },
          ],
          next_page: null,
        },
        {
          ...storeProduct,
          store_identifier: "monthly50",
          type: "subscription",
        },
      ]);
      expect(
        await client.verify(
          {
            ...base,
            type,
            product_id: "monthly50",
            expiration_at_ms: now + 3600000,
          },
          "subscription",
        ),
      ).toMatchObject({
        grant: false,
        refund: false,
        subscription: { status: "billing_retry" },
      });
    },
  );
});
