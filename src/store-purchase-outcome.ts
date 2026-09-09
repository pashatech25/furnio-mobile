import { PURCHASES_ERROR_CODE } from "react-native-purchases";

export type StorePurchaseObservation =
  | "cancelled"
  | "payment_pending"
  | "already_owned"
  | "unknown";

// Classify only the SDK purchase call's rejection. Neither message text nor
// the deprecated userCancelled helper is authoritative. This is device-side
// UX context, never server evidence, an entitlement or permission to retry.
export function storePurchaseObservation(
  error: unknown,
): StorePurchaseObservation {
  if (!error || typeof error !== "object" || !("code" in error))
    return "unknown";
  switch (error.code) {
    case PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR:
      return "cancelled";
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return "payment_pending";
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
      return "already_owned";
    default:
      return "unknown";
  }
}

export function unresolvedPurchaseStatus(
  observation?: StorePurchaseObservation,
) {
  switch (observation) {
    case "cancelled":
      return "cancelled_unresolved" as const;
    case "payment_pending":
      return "awaiting_store" as const;
    case "already_owned":
      return "store_owned" as const;
    default:
      return "interrupted" as const;
  }
}
