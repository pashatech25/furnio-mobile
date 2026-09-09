import { z } from "zod";
import { boundedBytes, HttpError } from "./http";
import { NativeDatabase, nativeConfiguration } from "./native-events";
import { checkSdkCancellation } from "./checkout-cancellation";

const store = z.enum(["APP_STORE", "PLAY_STORE"]);
export const intentStatus = z.object({
  intentId: z.uuid(),
  status: z.enum(["reserved", "pending", "verified", "cancelled", "expired"]),
});
export const eligibilityResult = z.union([
  z.object({
    enabled: z.literal(true),
    allowed: z.literal(true),
    intentId: z.uuid(),
    expiresAt: z.iso.datetime({ offset: true }),
  }),
  z.object({
    enabled: z.literal(true),
    allowed: z.literal(false),
    reason: z.enum([
      "existing_subscription",
      "purchase_pending",
      "request_already_used",
    ]),
  }),
]);
async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (new URL(request.url).search)
    throw new HttpError(400, "Purchase requests accept no query parameters.");
  if (
    request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "JSON is required.");
  let body: unknown;
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
        await boundedBytes(request.body, 2048),
      ),
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid purchase request.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "Invalid purchase request.");
  return parsed.data;
}
function requireAcquisition(env: Env) {
  // An independent deployment gate; commerceReady remains false until every
  // release gate is met, even if a staging operator tests these endpoints.
  if (
    env.MOBILE_ENABLED !== "true" ||
    env.NATIVE_ACQUISITION_ENABLED !== "true"
  )
    throw new HttpError(503, "New store purchases are not enabled.");
}
export async function purchaseEligibility(
  request: Request,
  userId: string,
  env: Env,
  database = new NativeDatabase(env),
) {
  requireAcquisition(env);
  const config = nativeConfiguration(env);
  const body = await readBody(
    request,
    z
      .object({
        store,
        productId: z.string().min(1).max(255),
        requestId: z.uuid(),
      })
      .strict(),
  );
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([body.store, body.productId])),
  );
  const fingerprint = Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  // Zod strips server-only Stripe session/other intent details from blocked responses.
  return database.rpc(
    "begin_customer_purchase_intent",
    {
      p_user: userId,
      p_environment: config.environment,
      p_provider: body.store,
      p_product: body.productId,
      p_request: body.requestId,
      p_fingerprint: fingerprint,
    },
    eligibilityResult,
  );
}
export async function purchaseIntent(
  request: Request,
  userId: string,
  id: string,
  env: Env,
  database = new NativeDatabase(env),
) {
  const config = nativeConfiguration(env);
  if (!z.uuid().safeParse(id).success || new URL(request.url).search)
    throw new HttpError(400, "Invalid purchase reference.");
  const base = {
    p_user: userId,
    p_environment: config.environment,
    p_intent: id,
  };
  if (request.method === "GET")
    return database.rpc("read_native_purchase_intent", base, intentStatus);
  const body = await readBody(
    request,
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("launch"), store }).strict(),
      z
        .object({
          action: z.literal("report"),
          transactionId: z
            .string()
            .min(1)
            .max(512)
            .regex(/^[^\x00-\x1f\x7f]+$/),
        })
        .strict(),
      z.object({ action: z.literal("cancel") }).strict(),
      z.object({ action: z.literal("store_cancelled") }).strict(),
    ]),
  );
  if (body.action === "launch") {
    requireAcquisition(env);
    const launched = await database.rpc(
      "launch_customer_purchase_intent",
      { ...base, p_provider: body.store },
      z.boolean(),
    );
    if (!launched)
      throw new HttpError(
        409,
        "Checkout already started or expired. Check purchase recovery before trying again.",
      );
    return { intentId: id, status: "pending" as const };
  }
  if (body.action === "cancel") {
    await database.rpc("read_native_purchase_intent", base, intentStatus);
    // SQL refuses to release a launched payment, even on a client cancel claim.
    await database.rpc("cancel_unlaunched_purchase_intent", base, z.boolean());
  }
  if (body.action === "store_cancelled") {
    const current = await database.rpc(
      "read_native_purchase_intent",
      base,
      intentStatus,
    );
    if (current.status !== "pending") return current;
    await checkSdkCancellation(userId, id, env, database);
  }
  return database.rpc(
    "read_native_purchase_intent",
    {
      ...base,
      ...(body.action === "report"
        ? { p_transaction_hint: body.transactionId }
        : {}),
    },
    intentStatus,
  );
}

export async function recoverPurchaseSelection(
  request: Request,
  userId: string,
  env: Env,
  database = new NativeDatabase(env),
) {
  const config = nativeConfiguration(env);
  const body = await readBody(
    request,
    z.object({ store, requestId: z.uuid() }).strict(),
  );
  return database.rpc(
    "recover_native_purchase_selection",
    {
      p_user: userId,
      p_environment: config.environment,
      p_provider: body.store,
      p_request: body.requestId,
    },
    z.union([
      intentStatus,
      z.object({ intentId: z.null(), status: z.literal("not_found") }),
    ]),
  );
}
