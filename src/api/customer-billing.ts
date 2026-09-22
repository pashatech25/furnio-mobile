import type { ApiClient } from "./client";
import { capabilitiesSchema, mobileBillingSchema } from "./schemas";
import { readWebsiteBilling } from "./website-billing";

export async function readCustomerBilling(
  website: ApiClient,
  mobile: ApiClient,
  nativeBilling: boolean,
) {
  if (!nativeBilling) return readWebsiteBilling(website);
  const capabilities = await mobile("/v1/capabilities", capabilitiesSchema);
  if (!capabilities.billingReady) return readWebsiteBilling(website);
  // This is a complete server snapshot, not an amount to add to web credits.
  // Do not hide a failed native read by presenting Stripe-only history as current.
  return mobile("/v1/billing?store=APP_STORE", mobileBillingSchema);
}
