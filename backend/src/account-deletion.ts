import { z } from "zod";
import { boundedBytes, HttpError } from "./http";
import { NativeDatabase, storeEnvironment } from "./native-events";
import { requireRecentAccountAuth } from "./recent-auth";
import { beginAccountPrivacyLimits } from "./account-rate-limits";
import {
  deletionCapabilitySchema,
  deletionConfirmationSchema,
  deletionReceiptSchema,
  accountDeletionReviewSchema,
  deletionPreparationSchema,
} from "../../src/account-deletion-contract";

// Not an environment switch: the cleanup processor/ownership-retention paths
// must actually exist and pass staging before this code gate can be removed.
export const deletionProcessorImplemented = false;

export {
  accountDeletionReviewSchema,
  deletionPreparationSchema,
} from "../../src/account-deletion-contract";

// Review is read-only. Deliberately separate from accountDeletionReady: neither
// this flag nor this endpoint can deactivate an account or start cleanup.
export async function reviewAccountDeletion(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
) {
  if (env.MOBILE_ACCOUNT_REVIEW_ENABLED !== "true")
    throw new HttpError(503, "Account deletion review is not enabled.");
  if (request.method !== "GET" || new URL(request.url).search || request.body)
    throw new HttpError(400, "Account deletion review accepts no parameters.");
  const limits = await beginAccountPrivacyLimits(request, env);
  // This route intentionally does not require the paid customer platform, phone
  // verification, or an unsuspended account. Those restrictions must not deny
  // an authenticated account holder their account-deletion privacy controls.
  const identity = await requireRecentAccountAuth(request, env, fetcher);
  await limits.user(identity.userId);
  const database = new NativeDatabase(env, fetcher);
  return database.rpc(
    "get_mobile_account_deletion_review",
    {
      p_user: identity.userId,
      p_session: identity.sessionId,
      p_authenticated_at: identity.authenticatedAt,
      p_authentication_method: identity.authenticationMethod,
      p_assurance: identity.assurance,
      p_environment: storeEnvironment(env),
    },
    accountDeletionReviewSchema,
  );
}

export async function manageAccountDeletionRequest(
  request: Request,
  action: "prepare" | "confirm" | "cancel" | "status",
  env: Env,
  fetcher: typeof fetch = fetch,
) {
  if (request.method !== "POST" || new URL(request.url).search)
    throw new HttpError(
      400,
      "Account requests require a POST body, not URL parameters.",
    );
  if (
    !/^application\/json(?:\s*;.*)?$/i.test(
      request.headers.get("Content-Type") ?? "",
    )
  )
    throw new HttpError(415, "Account requests require JSON.");
  // Already accepted status must stay accessible after sign-out and rollback.
  // The capability grants no authority to authenticate, confirm or delete.
  if (action !== "status" && env.MOBILE_ACCOUNT_REQUESTS_ENABLED !== "true")
    throw new HttpError(503, "Account deletion requests are not enabled.");
  if (action === "confirm" && !deletionProcessorImplemented)
    throw new HttpError(
      503,
      "Account deletion is not available in this build. Your account has not been changed.",
    );
  const limits = await beginAccountPrivacyLimits(request, env);
  const bytes = await boundedBytes(request.body, 4096);
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    throw new HttpError(400, "Account requests require a valid JSON body.");
  }
  const input = (
    action === "confirm" ? deletionConfirmationSchema : deletionCapabilitySchema
  ).safeParse(parsed);
  if (!input.success)
    throw new HttpError(400, "Invalid account request confirmation.");
  const identity =
    action === "status"
      ? null
      : await requireRecentAccountAuth(request, env, fetcher);
  if (identity) await limits.user(identity.userId);
  else await limits.receipt(input.data.requestId, input.data.receiptSecret);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input.data.receiptSecret),
  );
  const receiptHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const proof = identity
    ? {
        p_user: identity.userId,
        p_session: identity.sessionId,
        p_authenticated_at: identity.authenticatedAt,
        p_authentication_method: identity.authenticationMethod,
        p_assurance: identity.assurance,
      }
    : {};
  const confirmation = deletionConfirmationSchema.safeParse(input.data);
  const body = {
    p_action: action,
    p_environment: storeEnvironment(env),
    p_request: input.data.requestId,
    p_receipt_hash: receiptHash,
    ...proof,
    ...(action === "confirm" && confirmation.success
      ? {
          p_challenge: confirmation.data.challenge,
          p_notice_version: confirmation.data.noticeVersion,
          p_confirmation: confirmation.data.confirmation,
          p_acknowledge_shared_account:
            confirmation.data.acknowledgeSharedAccount,
          p_acknowledge_billing: confirmation.data.acknowledgeBilling,
        }
      : {}),
  };
  const database = new NativeDatabase(env, fetcher);
  if (action === "prepare") {
    const prepared = await database.rpc(
      "manage_mobile_account_deletion_request",
      body,
      deletionPreparationSchema,
    );
    if (
      prepared.requestId !== input.data.requestId ||
      (prepared.state === "prepared") !== (prepared.challenge !== null)
    )
      throw new HttpError(502, "Account request response is incompatible.");
    return {
      ...prepared,
      canConfirm: prepared.canConfirm && deletionProcessorImplemented,
    };
  }
  const receipt = await database.rpc(
    "manage_mobile_account_deletion_request",
    body,
    deletionReceiptSchema.nullable(),
  );
  if (!receipt) throw new HttpError(404, "Account request receipt not found.");
  if (receipt.requestId !== input.data.requestId)
    throw new HttpError(502, "Account request response is incompatible.");
  return receipt;
}
