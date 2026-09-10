import type { JobStatusResponse } from "../contracts/jobs";

// Terminal jobs can consume a trial output or release reserved credits.
export function shouldRefreshAccount(status: JobStatusResponse["status"]) {
  return ["succeeded", "partial", "failed", "cancelled"].includes(status);
}
