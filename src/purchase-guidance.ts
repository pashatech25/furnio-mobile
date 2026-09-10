// Android consumption-only purchasing information: plain text, never a link.
// iOS remains neutral until eligible storefront-specific steering is implemented.
export function purchaseGuidance(platform: string) {
  return platform === "android"
    ? "Credits and subscriptions are available through Furnio’s website, furnio.ai. Sign in there with the same Furnio account. Your purchases become available in this app; return here and refresh your balance. Purchases are not offered inside this app."
    : "Already have a Furnio account? Sign in with the same account to access your shared credits, projects and eligible services. Purchases are not offered inside this app.";
}
