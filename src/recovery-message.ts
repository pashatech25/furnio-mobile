export function recoveryMessage(
  status:
    | "synchronized"
    | "pending"
    | "needs_review"
    | "not_started"
    | "no_purchases_found"
    | "verified"
    | "selection_pending"
    | "cancelled_unresolved"
    | "awaiting_store"
    | "store_owned"
    | "interrupted"
    | "selection_cleared",
) {
  switch (status) {
    case "selection_pending":
      return {
        title: "An earlier selection needs checking",
        body: "Check purchase recovery to safely clear an unstarted checkout or find its payment status. No new payment will open automatically. Your existing credits remain available.",
      };
    case "cancelled_unresolved":
      return {
        title: "Store checkout was cancelled",
        body: "The store reported cancellation. On Apple, this can also mean the product is already owned. Check recovery or restore purchases. If it stays unresolved, contact support with your saved-checkout reference. Do not buy again until Furnio clears this checkout.",
      };
    case "awaiting_store":
      return {
        title: "Waiting for Apple or Google",
        body: "Your purchase needs approval or another payment step. Follow the instructions from your store. Credits arrive only after payment is verified. You can leave this screen and check recovery later; do not buy again while it is pending.",
      };
    case "store_owned":
      return {
        title: "Your store already owns this product",
        body: "Choose Restore purchases to check ownership for this Furnio account. Do not buy again or switch Furnio accounts to retry. If it cannot be matched safely, contact support with your saved-checkout reference.",
      };
    case "interrupted":
      return {
        title: "Checkout outcome is not confirmed",
        body: "The store did not return a confirmed result, or checkout was interrupted. Check recovery or restore purchases before trying again. Do not buy again while this is unresolved. Your existing credits remain available.",
      };
    case "selection_cleared":
      return {
        title: "Checkout selection cleared",
        body: "You can choose a product again. Recovery did not open a new payment, cancel a subscription or refund a purchase. A delayed unstarted reservation may take up to ten minutes to clear. If the store shows a charge, restore that purchase or contact support instead of buying again.",
      };
    case "verified":
      return {
        title: "Purchase verified",
        body: "Furnio verified this specific store transaction. Its credit delivery is recorded in your shared balance and transaction history. Any later store refund is shown separately.",
      };
    case "synchronized":
      return {
        title: "Purchase history checked",
        body: "The available, verified store history has been reconciled and your balance refreshed. A very recent payment may still be reaching Furnio. If credits are missing, do not purchase again—retry Restore shortly or contact support.",
      };
    case "pending":
      return {
        title: "Purchase verification is pending",
        body: "Furnio has not yet verified this checkout. Use Check purchase recovery to look for it. You can close this screen safely. Do not purchase again while your payment is being confirmed.",
      };
    case "needs_review":
      return {
        title: "Purchase needs a support review",
        body: "Furnio could not safely reconcile part of your store history. Contact support and do not purchase again. Your existing credits remain available.",
      };
    case "no_purchases_found":
      return {
        title: "No purchases found yet",
        body: "No native purchases were verified for this Furnio account. Check your Apple or Google account. If the store just confirmed payment, wait a moment and retry Restore—do not buy again.",
      };
    case "not_started":
      return {
        title: "Check your store purchases",
        body: "Choose Restore purchases to check this account’s store history. Website purchases are already in your shared Furnio balance.",
      };
  }
}
