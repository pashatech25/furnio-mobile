import { describe, expect, it } from "vitest";
import { verifyRefundHistory } from "./refund-state";
import type { NativeEvent } from "./revenuecat-webhook";

const now = 1788954000000;
const event: NativeEvent = {
  id: "reverse",
  type: "REFUND_REVERSED",
  app_id: "app_apple",
  event_timestamp_ms: now,
  app_user_id: "00000000-0000-4000-8000-000000000001",
  original_app_user_id: "00000000-0000-4000-8000-000000000001",
  environment: "SANDBOX",
  store: "APP_STORE",
  aliases: [],
  product_id: "pack20",
  transaction_id: "txn1",
  original_transaction_id: "txn1",
  purchased_at_ms: now - 86400000,
  expiration_at_ms: null,
  period_type: "NORMAL",
  is_family_share: false,
};
const row = (change: Partial<NativeEvent> = {}) => {
  const body = { ...event, ...change };
  return {
    object: "customer.event" as const,
    id: `history-${body.type}-${body.event_timestamp_ms}`,
    type: `PURCHASES_${body.type}`,
    app_id: body.app_id,
    body,
    created_at: body.event_timestamp_ms,
  };
};
describe("verified refund history", () => {
  it.each(["transaction_id", "environment", "store"])(
    "does not skip incomplete %s on a potentially newer refund",
    async (field) => {
      const incomplete = row({
        type: "CANCELLATION",
        cancel_reason: "CUSTOMER_SUPPORT",
        event_timestamp_ms: now + 1000,
      });
      delete (incomplete.body as Record<string, unknown>)[field];
      await expect(
        verifyRefundHistory([row(), incomplete], event, ["app_apple"], now),
      ).rejects.toMatchObject({ status: 409 });
    },
  );
  it("does not guess the reason for an incomplete later cancellation", async () => {
    const incomplete = row({
      type: "CANCELLATION",
      event_timestamp_ms: now + 1000,
    });
    await expect(
      verifyRefundHistory([row(), incomplete], event, ["app_apple"], now),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("accepts duplicate webhook/history representations of the same state, not double credits", async () => {
    const result = await verifyRefundHistory(
      [row(), row()],
      event,
      ["app_apple"],
      now,
    );
    expect(result).toMatchObject({ refunded: false, revisionMs: now });
  });
  it.each([
    { app_user_id: "00000000-0000-4000-8000-000000000002" },
    { original_app_user_id: "anonymous" },
    { app_id: "other_app" },
    { product_id: "other_pack" },
    { original_transaction_id: "other_family" },
    { purchased_at_ms: now - 1000 },
    { is_family_share: true },
    { quantity: 2 },
    { period_type: "TRIAL" as const },
    { event_timestamp_ms: now + 300001 },
    { event_timestamp_ms: now - 86400001 },
    { aliases: ["00000000-0000-4000-8000-000000000002"] },
  ])("rejects conflicting identity/transaction evidence %j", async (change) => {
    await expect(
      verifyRefundHistory([row(change)], event, ["app_apple"], now),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not accept same-ID records from another store/environment", async () => {
    await expect(
      verifyRefundHistory(
        [row({ environment: "PRODUCTION" }), row({ store: "PLAY_STORE" })],
        event,
        ["app_apple"],
        now,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("rejects opposite states at exactly the same revision", async () => {
    await expect(
      verifyRefundHistory(
        [
          row(),
          row({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }),
        ],
        event,
        ["app_apple"],
        now,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("regular cancellation is not a refund reversal or evidence of payment", async () => {
    await expect(
      verifyRefundHistory(
        [
          row({ type: "UNCANCELLATION" }),
          row({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" }),
        ],
        event,
        ["app_apple"],
        now,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
