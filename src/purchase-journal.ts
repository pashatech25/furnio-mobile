import { z } from "zod";
import { Platform } from "react-native";
import { config } from "./config";
import { secureStorage } from "./auth/secure-storage";

export const journalSchema = z
  .object({
    requestId: z.uuid(),
    intentId: z.uuid().nullable(),
    productId: z.string().min(1).max(255),
    phase: z.enum(["preparing", "launched"]),
    transactionId: z.string().min(1).max(512).optional(),
    observation: z
      .enum(["cancelled", "payment_pending", "already_owned", "unknown"])
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.observation ||
      (value.phase === "launched" &&
        value.intentId !== null &&
        !value.transactionId),
    "Store observations require a launched checkout without a reported payment.",
  );
export type PurchaseJournal = z.infer<typeof journalSchema>;
function key(userId: string) {
  z.uuid().parse(userId);
  return `furnio.purchase.${config.mode}.${Platform.OS}.${userId}`;
}
export async function readPurchaseJournal(
  userId: string,
): Promise<PurchaseJournal | null> {
  const raw = await secureStorage.getItem(key(userId));
  if (!raw) return null;
  // Fail closed on corrupt recovery data rather than replacing it and charging again.
  return journalSchema.parse(JSON.parse(raw));
}
export async function savePurchaseJournal(
  userId: string,
  journal: PurchaseJournal,
) {
  await secureStorage.setItem(
    key(userId),
    JSON.stringify(journalSchema.parse(journal)),
  );
}
export async function clearPurchaseJournal(userId: string) {
  await secureStorage.removeItem(key(userId));
}
