import { z } from "zod";
import { NativeDatabase, storeEnvironment } from "./native-events";
import { HttpError } from "./http";

const subscription = z.object({
  id: z.string(),
  provider: z.enum(["stripe", "app_store", "play_store"]),
  name: z.string(),
  status: z.string(),
  currentPeriodEnd: z.iso.datetime({ offset: true }),
  cancelAtPeriodEnd: z.boolean(),
});
export const billingSnapshot = z.object({
  balance: z.number().int().nonnegative(),
  subscription: subscription.nullable(),
  subscriptions: z.array(subscription),
  subscriptionConflict: z.boolean(),
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
      credits: z.number().int(),
      label: z.string(),
      createdAt: z.iso.datetime({ offset: true }),
    }),
  ),
  acquisitionEnabled: z.boolean(),
});
export async function getMobileBilling(userId: string, url: URL, env: Env) {
  const store = z
    .enum(["APP_STORE", "PLAY_STORE"])
    .safeParse(url.searchParams.get("store"));
  if (!store.success)
    throw new HttpError(400, "Select the native store for this device.");
  const result = await new NativeDatabase(env).rpc(
    "get_mobile_billing_snapshot",
    {
      p_user: userId,
      p_environment: storeEnvironment(env),
      p_store: store.data,
    },
    billingSnapshot,
  );
  // The schema flag is necessary but not sufficient. Web/Admin subscription
  // compatibility, restore and payment gates are still mandatory before sales.
  return { ...result, acquisitionEnabled: false };
}
