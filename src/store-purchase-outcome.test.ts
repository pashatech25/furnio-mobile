import { describe, expect, it, vi } from "vitest";
vi.mock("react-native-purchases", () => ({
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: "1",
    PAYMENT_PENDING_ERROR: "20",
    PRODUCT_ALREADY_PURCHASED_ERROR: "6",
  },
}));
import {
  storePurchaseObservation,
  unresolvedPurchaseStatus,
} from "./store-purchase-outcome";
import { recoveryMessage } from "./recovery-message";

describe("redacted store outcomes, not payment evidence", () => {
  it.each([
    ["1", "cancelled", "cancelled_unresolved"],
    ["20", "payment_pending", "awaiting_store"],
    ["6", "already_owned", "store_owned"],
    ["2", "unknown", "interrupted"],
    ["10", "unknown", "interrupted"],
    ["15", "unknown", "interrupted"],
  ] as const)(
    "classifies SDK code %s without keeping provider details",
    (code, observation, status) => {
      const result = storePurchaseObservation({
        code,
        userCancelled: true,
        message: "sensitive",
        receipt: "sensitive",
      });
      expect(result).toBe(observation);
      expect(unresolvedPurchaseStatus(result)).toBe(status);
      const message = recoveryMessage(status);
      expect(message.body.toLowerCase()).toContain("do not buy again");
      expect(message.body).not.toContain("sensitive");
      expect(message.title).not.toMatch(/verified|complete|successful/i);
    },
  );
  it.each([
    null,
    undefined,
    "cancelled",
    { userCancelled: true },
    { code: 1 },
    { code: "PURCHASE_CANCELLED_ERROR" },
    { message: "Purchase was cancelled" },
  ])("does not infer cancellation from ambiguous error %j", (error) => {
    expect(storePurchaseObservation(error)).toBe("unknown");
  });
  it("does not claim a queue is running based on a saved transaction hint", () => {
    expect(recoveryMessage("pending").title).toBe(
      "Purchase verification is pending",
    );
  });
});
