import type { Trial } from "./schemas";

// Mirror apps/web/src/components/trial-context.tsx. Credits granted by Admin
// or purchased on the website can fund services outside the preview allowance.
export function hasServiceCredits(balance: number | null, cost: number | undefined): boolean {
  return balance !== null && Number.isFinite(balance) && cost !== undefined && Number.isFinite(cost) && cost > 0 && balance >= cost;
}
export function trialRemaining(trial: Trial | null): number | null {
  if (!trial?.enabled || trial.state !== "active") return null;
  return Math.max(0, trial.successfulOutputLimit - trial.successfulOutputs);
}
export function isTrialServiceLocked(trial: Trial | null, slug: string): boolean {
  const free = trial?.enabled === true && ["active", "exhausted", "expired", "suspended"].includes(trial.state);
  const available = trial?.enabled === true && trial.state === "active" && trial.allowedServiceSlugs.includes(slug) && (trialRemaining(trial) ?? 0) > 0;
  return free && !available;
}
export function isServiceLocked(trial: Trial | null, slug: string, balance: number | null, cost: number | undefined): boolean {
  if (!trial || balance === null || (trial.phoneRequired && !trial.phoneVerified)) return true;
  return isTrialServiceLocked(trial, slug) && !hasServiceCredits(balance, cost);
}

// Presentation estimate matching the existing single-job resolver. The server
// still checks the balance, trial attempts, current pricing and permissions.
export function canUseTrialPreview(
  trial: Trial | null,
  service: string,
  balance: number | null,
  cost: number,
) {
  return (
    balance !== null &&
    Number.isFinite(balance) &&
    cost > 0 &&
    balance < cost &&
    trial?.enabled === true &&
    trial.phoneVerified &&
    trial.state === "active" &&
    trial.allowedServiceSlugs.includes(service) &&
    trial.successfulOutputs < trial.successfulOutputLimit
  );
}
