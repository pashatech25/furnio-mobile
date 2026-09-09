import { z } from "zod";
import { HttpError } from "./http";
import { historyEntrySchema, normalizeHistoryEntry } from "./recovery-history";
import type { NativeEvent } from "./revenuecat-webhook";

export type VerifiedRefundState = {
  refunded: boolean;
  revisionMs: number;
  evidenceId: string;
};

export function isRefundEvent(event: NativeEvent) {
  return (
    event.type === "REFUND_REVERSED" ||
    (event.type === "CANCELLATION" &&
      event.cancel_reason === "CUSTOMER_SUPPORT")
  );
}

/** Input must be a COMPLETE, bounded, independently fetched RevenueCat history.
 * A client success, current entitlement, or signed webhook alone is not evidence
 * that a historical subscription refund was reversed. No raw history is retained.
 */
export async function verifyRefundHistory(
  rows: z.infer<typeof historyEntrySchema>[],
  incoming: NativeEvent,
  appIds: readonly string[],
  now = Date.now(),
): Promise<VerifiedRefundState> {
  let latest: VerifiedRefundState | undefined;
  let incomingFound = !isRefundEvent(incoming);
  for (const row of rows) {
    const type = row.type.replace(/^PURCHASES_/, "");
    if (
      ["CANCELLATION", "REFUND_REVERSED"].includes(type) &&
      (typeof row.body.transaction_id !== "string" || !row.body.transaction_id)
    )
      throw new HttpError(409, "Incomplete refund history requires review.");
    if (row.body.transaction_id !== incoming.transaction_id) continue;
    if (
      row.body.environment == null ||
      row.body.store == null ||
      (type === "CANCELLATION" && typeof row.body.cancel_reason !== "string")
    )
      throw new HttpError(409, "Incomplete refund history requires review.");
    // Store transaction identifiers are not globally unique between environments.
    if (
      row.body.environment !== incoming.environment ||
      row.body.store !== incoming.store
    )
      continue;
    if (
      type !== "REFUND_REVERSED" &&
      !(
        type === "CANCELLATION" && row.body.cancel_reason === "CUSTOMER_SUPPORT"
      )
    )
      continue;
    const normalized = await normalizeHistoryEntry(
      row,
      incoming.app_user_id,
      incoming.environment,
      appIds,
    );
    if (typeof normalized === "string")
      throw new HttpError(409, "Refund history identity requires review.");
    const event = normalized.event;
    if (
      event.app_id !== incoming.app_id ||
      event.product_id !== incoming.product_id ||
      event.original_transaction_id !== incoming.original_transaction_id ||
      event.purchased_at_ms !== incoming.purchased_at_ms ||
      event.period_type !== incoming.period_type ||
      event.period_type === "TRIAL" ||
      (event.quantity ?? 1) !== 1 ||
      event.event_timestamp_ms < event.purchased_at_ms ||
      event.event_timestamp_ms > now + 300_000 ||
      (event.type === "REFUND_REVERSED" && event.store !== "APP_STORE")
    )
      throw new HttpError(409, "Refund history transaction requires review.");
    if (
      event.type === incoming.type &&
      event.event_timestamp_ms === incoming.event_timestamp_ms
    )
      incomingFound = true;
    const state = {
      refunded: event.type !== "REFUND_REVERSED",
      revisionMs: event.event_timestamp_ms,
      evidenceId: event.id,
    };
    if (
      latest?.revisionMs === state.revisionMs &&
      latest.refunded !== state.refunded
    )
      throw new HttpError(409, "Conflicting refund revisions require review.");
    if (!latest || latest.revisionMs < state.revisionMs) latest = state;
  }
  if (!latest || !incomingFound)
    throw new HttpError(
      503,
      "Refund history is not yet independently verified.",
    );
  return latest;
}
