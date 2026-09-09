import type { Trial } from "./schemas";

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
