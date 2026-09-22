import { z } from "zod";
import { NativeDatabase, customerStoreContext, nativeCommerceReadiness } from "./native-events";
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
  const database = new NativeDatabase(env);
  const context = await customerStoreContext(userId, env, database);
  const result = context.enrolled ? await database.rpc("get_native_sandbox_billing", { p_user: userId }, billingSnapshot) : await database.rpc(
    "get_mobile_billing_snapshot",
    {
      p_user: userId,
      p_environment: context.environment,
      p_store: store.data,
    },
    billingSnapshot,
  );
  // Sandbox receipts must never replace the customer's shared real-money
  // balance/history. Keep test accounting separate from the account summary.
  const real = context.enrolled ? await database.rpc(
    "get_mobile_billing_snapshot",
    { p_user: userId, p_environment: "PRODUCTION", p_store: store.data },
    billingSnapshot,
  ) : result;
  return {
    ...result,
    balance: real.balance,
    subscription: real.subscription,
    subscriptions: real.subscriptions,
    subscriptionConflict: real.subscriptionConflict,
    transactions: real.transactions,
    ...(context.enrolled ? { sandbox: {
      balance: result.balance,
      subscriptions: result.subscriptions,
      transactions: result.transactions,
    } } : {}),
    acquisitionEnabled: result.acquisitionEnabled &&
      store.data === "APP_STORE" && nativeCommerceReadiness(env).commerceReady,
  };
}
