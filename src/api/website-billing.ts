import { z } from "zod";
import type { ApiClient } from "./client";
import type { MobileBilling } from "./schemas";

// Deliberately select only read-only fields from the existing customer API.
// Package offers, checkout URLs and invoice actions never enter the app state.
export const websiteBillingSchema = z.object({
  balance: z.number().int(),
  subscription: z
    .object({
      id: z.string().min(1),
      currentPlanName: z.string().min(1),
      status: z.string().min(1),
      currentPeriodEnd: z.iso.datetime({ offset: true }),
      cancelAtPeriodEnd: z.boolean(),
    })
    .nullable(),
  recentTransactions: z.array(
    z.object({
      id: z.number().int().positive(),
      credits: z.number().int(),
      reason: z.string(),
      createdAt: z.iso.datetime({ offset: true }),
    }),
  ),
});

export async function readWebsiteBilling(
  api: ApiClient,
): Promise<MobileBilling> {
  const account = await api("/api/billing", websiteBillingSchema);
  const subscription = account.subscription && {
    id: account.subscription.id,
    provider: "stripe" as const,
    name: account.subscription.currentPlanName,
    status: account.subscription.status,
    currentPeriodEnd: account.subscription.currentPeriodEnd,
    cancelAtPeriodEnd: account.subscription.cancelAtPeriodEnd,
  };
  return {
    balance: account.balance,
    subscription,
    subscriptions: subscription ? [subscription] : [],
    acquisitionEnabled: false,
    products: [],
    transactions: account.recentTransactions.map((entry) => ({
      id: String(entry.id),
      provider:
        entry.reason === "purchase" || entry.reason === "subscription_grant"
          ? "stripe"
          : "furnio",
      credits: entry.credits,
      label:
        entry.reason === "purchase"
          ? "Credit pack"
          : entry.reason === "subscription_grant"
            ? "Subscription credits"
            : "Credit adjustment",
      createdAt: entry.createdAt,
    })),
  };
}
