import { z } from "zod";
export const featureSchema = z.object({
  slug: z.string(),
  display_name: z.string(),
  description: z.string(),
  credits_per_output: z.number().int().positive(),
  sort_order: z.number(),
});
export const runtimeSchema = z.object({
  features: z.array(featureSchema),
  trial: z.object({
    enabled: z.boolean(),
    allowedServiceSlugs: z.array(z.string()),
    successfulOutputLimit: z.number(),
    unlockCredits: z.number(),
    turnstileSiteKey: z.string().nullable(),
  }),
  runtime: z.object({
    disclosure: z.record(z.string(), z.unknown()),
    image_pipeline: z.record(z.string(), z.unknown()),
  }),
});
export const trialSchema = z.object({
  allowedCountryCodes: z.array(z.string()),
  allowedServiceSlugs: z.array(z.string()),
  phoneRequired: z.boolean(),
  phoneVerified: z.boolean(),
  minimumResendSeconds: z.number().min(30),
  state: z.enum([
    "not_started",
    "pending_phone",
    "active",
    "exhausted",
    "expired",
    "converted",
    "suspended",
  ]),
  successfulOutputLimit: z.number(),
  successfulOutputs: z.number(),
  enabled: z.boolean(),
  expiresAt: z.string().nullable(),
  turnstileSiteKey: z.string().nullable(),
  unlockCredits: z.number(),
});
export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  created_at: z.string(),
  archived_at: z.string().nullable(),
  purged_at: z.string().nullable().optional(),
});
export const historySchema = z.object({
  id: z.uuid(),
  featureSlug: z.string(),
  created_at: z.string(),
  error: z.string().nullable(),
  resultAssetId: z.uuid().nullable(),
  resultUrl: z.url().nullable(),
  sourceUrl: z.url().nullable(),
  resultAccessLevel: z.enum(["paid", "trial_locked"]),
  status: z.enum([
    "queued",
    "running",
    "partial",
    "succeeded",
    "failed",
    "cancelled",
  ]),
});
export const workspaceSchema = z.object({
  project: projectSchema,
  history: z.array(historySchema),
  photoUsage: z.object({ count: z.number(), limit: z.number() }),
});
export const capabilitiesSchema = z.object({
  version: z.literal(1),
  commerceReady: z.boolean(),
  recoveryReady: z.boolean().default(false),
  billingReady: z.boolean().default(false),
  activityReady: z.boolean().default(false),
  accountDeletionReady: z.boolean(),
  accountDeletionReviewReady: z.boolean().default(false),
  accountDeletionRequestsReady: z.boolean().default(false),
  notificationsReady: z.boolean(),
});
export const mobileBillingSchema = z.object({
  balance: z.number().int(),
  subscription: z
    .object({
      provider: z.enum(["stripe", "app_store", "play_store"]),
      name: z.string(),
      status: z.string(),
      currentPeriodEnd: z.string(),
      cancelAtPeriodEnd: z.boolean(),
    })
    .nullable(),
  subscriptions: z
    .array(
      z.object({
        id: z.string(),
        provider: z.enum(["stripe", "app_store", "play_store"]),
        name: z.string(),
        status: z.string(),
        currentPeriodEnd: z.string(),
        cancelAtPeriodEnd: z.boolean(),
      }),
    )
    .optional(),
  subscriptionConflict: z.boolean().optional(),
  acquisitionEnabled: z.boolean().optional(),
  products: z.array(
    z.object({
      productId: z.string(),
      packageKey: z.string(),
      name: z.string(),
      credits: z.number().int().positive(),
      interval: z.enum(["month", "one_time"]),
    }),
  ),
  transactions: z.array(
    z.object({
      id: z.string(),
      provider: z.enum([
        "stripe",
        "app_store",
        "play_store",
        "admin",
        "furnio",
      ]),
      credits: z.number(),
      label: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type Runtime = z.infer<typeof runtimeSchema>;
export const activityPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      projectId: z.uuid().nullable(),
      projectName: z.string().nullable(),
      createdAt: z.string(),
      status: z.enum([
        "queued",
        "running",
        "partial",
        "succeeded",
        "failed",
        "cancelled",
      ]),
      archived: z.boolean(),
      featureSlug: z.string(),
    }),
  ),
  nextCursor: z.object({ createdAt: z.string(), id: z.uuid() }).nullable(),
});
export type ActivityItem = z.infer<typeof activityPageSchema>["items"][number];
export type Trial = z.infer<typeof trialSchema>;
export type Project = z.infer<typeof projectSchema>;
export type History = z.infer<typeof historySchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type MobileBilling = z.infer<typeof mobileBillingSchema>;
