import { z } from "zod";
import { ApiError, type ApiClient } from "../api/client";
import type {
  SubmissionJournal,
  SubmissionReceipt,
} from "./submission-journal";

export const submissionRecoverySchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not_found") }),
  z.object({ state: z.literal("needs_review") }),
  z.object({
    state: z.literal("found"),
    jobId: z.uuid(),
    status: z.enum([
      "queued",
      "running",
      "partial",
      "succeeded",
      "failed",
      "cancelled",
    ]),
  }),
]);
export function lookupSubmission(api: ApiClient, receipt: SubmissionReceipt) {
  const { projectId, service, sourceIds, referenceIds, anchorId } = receipt;
  return api("/api/mobile/v1/submissions/recover", submissionRecoverySchema, {
    projectId,
    service,
    sourceIds,
    referenceIds,
    anchorId,
  });
}

/** Exactly one dispatch after a durable receipt; no automatic retries of paid work.
 * The receipt stays until the confirmed job has actually been opened on screen.
 */
export async function submitWithReceipt<T>(input: {
  journal: SubmissionJournal;
  receipt: SubmissionReceipt;
  assertCurrent: () => void;
  send: (onDispatch: () => void) => Promise<T>;
}): Promise<T> {
  input.assertCurrent();
  await input.journal.claim(input.receipt);
  let dispatched = false;
  try {
    input.assertCurrent();
    const result = await input.send(() => {
      dispatched = true;
    });
    return result;
  } catch (error) {
    // These quote errors are generated before any job/credit work. A generic 4xx
    // is not proof: service handlers may already have created records at that point.
    const rejectedBeforeWork =
      error instanceof ApiError &&
      ["CREDIT_QUOTE_CHANGED", "CREDIT_QUOTE_REQUIRED"].includes(
        error.code ?? "",
      ) &&
      (error.status === 400 || error.status === 409);
    if (!dispatched || rejectedBeforeWork)
      await input.journal.clear(input.receipt).catch(() => undefined);
    throw error;
  }
}

/** Called only after an owned job has rendered. Never clear for an unrelated job,
 * a stale account, or an unavailable lookup. Local cleanup is allowed to fail.
 */
export async function acknowledgeViewedSubmission(input: {
  journal: SubmissionJournal;
  api: ApiClient;
  scope: string;
  userId: string;
  jobId: string;
  assertCurrent: () => void;
}) {
  input.assertCurrent();
  const receipt = await input.journal.load(input.scope, input.userId);
  input.assertCurrent();
  if (!receipt) return;
  const result = await lookupSubmission(input.api, receipt);
  input.assertCurrent();
  if (result.state === "found" && result.jobId === input.jobId)
    await input.journal.clear(receipt);
}
