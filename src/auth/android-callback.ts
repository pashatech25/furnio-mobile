export function androidCallbackDestination(input: {
  complete: boolean;
  loading: boolean;
  signedIn: boolean;
  recovery: boolean;
  trial: { phoneRequired: boolean; phoneVerified: boolean } | null;
}): "/reset-password" | "/verify" | "/(tabs)" | null {
  if (!input.complete || input.loading || !input.signedIn) return null;
  if (input.recovery) return "/reset-password";
  if (!input.trial) return null;
  return input.trial.phoneRequired && !input.trial.phoneVerified ? "/verify" : "/(tabs)";
}
