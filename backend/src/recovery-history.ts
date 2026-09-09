import { z } from "zod";
import { HttpError } from "./http";
import { nativeEventSchema, type NativeEvent } from "./revenuecat-webhook";

// The documented customer-events API is server evidence, not an SDK receipt or
// client assertion. Unknown/incomplete event shapes remain reviewable, not paid.
export const historyEntrySchema = z.object({
  object: z.literal("customer.event"),
  id: z.string().min(1).max(1500),
  type: z.string().min(1).max(100),
  app_id: z.string().max(255).nullable().optional(),
  body: z.record(z.string(), z.unknown()),
  created_at: z.number().int().safe().nonnegative(),
});
const supported = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "NON_RENEWING_PURCHASE",
  "CANCELLATION",
  "UNCANCELLATION",
  "BILLING_ISSUE",
  "EXPIRATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "SUBSCRIPTION_PAUSED",
  "REFUND_REVERSED",
]);
export async function normalizeHistoryEntry(
  row: z.infer<typeof historyEntrySchema>,
  customer: string,
  environment: NativeEvent["environment"],
  appIds: readonly string[],
): Promise<{ event: NativeEvent; bodyHash: string } | "ignored" | "review"> {
  const type = row.type.replace(/^PURCHASES_/, "");
  // Customer metadata changes and purchases belonging to another configured app
  // do not authorize Furnio credits. Do not retain their bodies.
  if (!row.type.startsWith("PURCHASES_") && !supported.has(type))
    return "ignored";
  if (row.app_id && !appIds.includes(row.app_id)) return "ignored";
  if (["TEST"].includes(type)) return "ignored";
  if (!supported.has(type)) return "review";
  if (row.body.type != null && row.body.type !== type) return "review";
  if (row.body.app_id != null && row.app_id && row.body.app_id !== row.app_id)
    return "review";
  const parsed = nativeEventSchema.safeParse({
    ...row.body,
    id: "history", // Namespaced hash below; never collide with raw webhook IDs.
    type,
    app_id: row.body.app_id ?? row.app_id,
  });
  if (!parsed.success) return "review";
  const event = parsed.data;
  if (
    event.app_user_id !== customer ||
    event.original_app_user_id !== customer ||
    event.environment !== environment ||
    !appIds.includes(event.app_id) ||
    event.is_family_share ||
    event.aliases.some(
      (alias) => z.uuid().safeParse(alias).success && alias !== customer,
    )
  )
    return "review";
  event.aliases = [];
  const digest = async (value: string) =>
    [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      ),
    ]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  event.id = `rc-recovery:${await digest(JSON.stringify([environment, customer, row.id]))}`;
  // Zod's explicit field list strips subscriber attributes and other private data.
  return { event, bodyHash: await digest(JSON.stringify(event)) };
}

export function eventPageCursor(
  next: string | null | undefined,
  expectedPath: string,
): string | null {
  if (!next) return null;
  const url = new URL(next, "https://api.revenuecat.com");
  if (
    !next.startsWith("/v2/") ||
    next.includes("\\") ||
    url.origin !== "https://api.revenuecat.com" ||
    url.pathname !== expectedPath ||
    url.hash ||
    [...url.searchParams.keys()].some(
      (key) => !["starting_after", "limit", "environment"].includes(key),
    ) ||
    url.searchParams.getAll("starting_after").length !== 1
  ) {
    throw new HttpError(502, "Invalid recovery pagination.");
  }
  const cursor = url.searchParams.get("starting_after");
  if (!cursor || cursor.length > 1500 || /[\u0000-\u001f\u007f]/.test(cursor))
    throw new HttpError(502, "Invalid recovery cursor.");
  return cursor;
}
