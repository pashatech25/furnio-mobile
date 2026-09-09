import { z } from "zod";

export const deletionNoticeVersion = "shared-account-v1" as const;
export const deletionConfirmation = "DELETE MY FURNIO ACCOUNT" as const;
export const deletionCapabilitySchema = z
  .object({
    requestId: z.uuid(),
    receiptSecret: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const deletionConfirmationSchema = deletionCapabilitySchema
  .extend({
    challenge: z.uuid(),
    noticeVersion: z.literal(deletionNoticeVersion),
    confirmation: z.literal(deletionConfirmation),
    acknowledgeSharedAccount: z.literal(true),
    acknowledgeBilling: z.literal(true),
  })
  .strict();
export const deletionReceiptSchema = z
  .object({
    version: z.literal(1),
    requestId: z.uuid(),
    state: z.enum(["prepared", "expired", "cancelled", "queued"]),
    createdAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    confirmedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((receipt, context) => {
    if ((receipt.state === "queued") !== (receipt.confirmedAt !== null))
      context.addIssue({
        code: "custom",
        message: "Inconsistent confirmation receipt.",
      });
    const created = Date.parse(receipt.createdAt),
      expires = Date.parse(receipt.expiresAt);
    if (expires <= created || expires > created + 300_000)
      context.addIssue({
        code: "custom",
        message: "Invalid confirmation window.",
      });
  });
export type DeletionCapability = z.infer<typeof deletionCapabilitySchema>;
export type DeletionReceipt = z.infer<typeof deletionReceiptSchema>;
export const accountDeletionReviewSchema = z
  .object({
    version: z.literal(1),
    scope: z.literal("shared_furnio_account"),
    canRequestDeletion: z.literal(false),
    accountAccess: z.enum(["active", "suspended"]),
    counts: z
      .object({
        projects: z.number().int().nonnegative(),
        storedAssets: z.number().int().nonnegative(),
        unfinishedJobs: z.number().int().nonnegative(),
      })
      .strict(),
    subscriptions: z
      .array(
        z
          .object({
            provider: z.enum(["stripe", "app_store", "play_store"]),
            context: z.enum(["customer", "developer"]),
            count: z.number().int().positive(),
            renewalNotCancelled: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(4),
    hasDeveloperWorkspace: z.boolean(),
    hasAdministratorRole: z.boolean(),
    linkedProviders: z
      .array(z.enum(["email", "google", "apple", "other"]))
      .max(4),
  })
  .strict();

export const deletionPreparationSchema = deletionReceiptSchema.safeExtend({
  challenge: z.uuid().nullable(),
  noticeVersion: z.literal(deletionNoticeVersion),
  canConfirm: z.boolean(),
  review: accountDeletionReviewSchema,
});
