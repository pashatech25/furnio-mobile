import { z } from "zod";
import { boundedBytes, boundedJson, HttpError } from "./http";
import { NativeDatabase } from "./native-events";

const installationSchema = z.object({
  installationId: z.uuid(),
  installationSecret: z.string().regex(/^[a-f0-9]{64}$/),
  revision: z.number().int().min(1).max(2_000_000_000),
});
const tokenSchema = z
  .string()
  .regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/);
const registerSchema = installationSchema
  .extend({
    platform: z.enum(["ios", "android"]),
    pushToken: tokenSchema,
    projectId: z.uuid(),
  })
  .strict();
const stateSchema = z.object({ enabled: z.boolean() }).strict();
const claimedSchema = z
  .array(z.object({ id: z.uuid(), leaseId: z.uuid() }))
  .max(10);
const deliverySchema = z
  .object({
    phase: z.enum(["send", "receipt"]),
    pushToken: tokenSchema,
    ticketId: z.uuid().nullable(),
  })
  .nullable();
const expoResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), id: z.uuid().optional() }),
  z.object({
    status: z.literal("error"),
    details: z.object({ error: z.string().max(100).optional() }).optional(),
  }),
]);
type Outcome = {
  result:
    | "sent"
    | "accepted"
    | "retry"
    | "resend"
    | "missing"
    | "failed"
    | "invalid";
  ticket?: string;
  code?: string;
};

function configuration(env: Env, enabled: boolean) {
  if (
    !["staging", "production"].includes(env.ENVIRONMENT) ||
    !z.uuid().safeParse(env.EXPO_PROJECT_ID).success
  )
    throw new HttpError(
      503,
      "This notification environment is not configured.",
    );
  if (
    enabled &&
    (env.MOBILE_NOTIFICATIONS_ENABLED !== "true" || !env.EXPO_ACCESS_TOKEN)
  )
    throw new HttpError(
      503,
      "Notifications are not enabled in this environment.",
    );
  return { p_environment: env.ENVIRONMENT, p_project: env.EXPO_PROJECT_ID };
}
export function notificationsReady(env: Env) {
  try {
    configuration(env, true);
    return env.MOBILE_ENABLED === "true";
  } catch {
    return false;
  }
}

export async function manageDevice(
  request: Request,
  action: "prepare" | "register" | "disable" | "status",
  userId: string | null,
  env: Env,
  database = new NativeDatabase(env),
) {
  const scope = configuration(
    env,
    action === "register" || action === "prepare",
  );
  if (
    new URL(request.url).search ||
    request.headers.get("Content-Type")?.split(";")[0]?.trim() !==
      "application/json"
  )
    throw new HttpError(
      400,
      "Use a JSON device request without query parameters.",
    );
  let body: unknown;
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
        await boundedBytes(request.body, 2048),
      ),
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid device request.");
  }
  const parsed = (
    action === "register" ? registerSchema : installationSchema.strict()
  ).safeParse(body);
  if (!parsed.success || (action !== "disable" && !userId))
    throw new HttpError(400, "Invalid device registration.");
  const input = parsed.data;
  if ("projectId" in input && input.projectId !== env.EXPO_PROJECT_ID)
    throw new HttpError(
      409,
      "This build belongs to a different notification project.",
    );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input.installationSecret),
  );
  const hash = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return database.rpc(
    "manage_mobile_push_device",
    {
      ...scope,
      p_installation: input.installationId,
      p_secret_hash: hash,
      p_revision: input.revision,
      p_action: action,
      p_user: action === "disable" ? null : userId,
      p_platform: "platform" in input ? input.platform : null,
      p_token: "pushToken" in input ? input.pushToken : null,
    },
    stateSchema,
  );
}

export function privacySafeMessage(token: string) {
  return {
    to: token,
    title: "Furnio",
    body: "There is an update in Furnio. Open the app to view it.",
    data: { type: "furnio.activity", version: 1 },
    channelId: "jobs",
    sound: "default",
    ttl: 3600,
    collapseId: "furnio-photo-updates",
    tag: "furnio-photo-updates",
  };
}
function errorOutcome(code?: string, receipt = false): Outcome {
  if (code === "DeviceNotRegistered")
    return { result: "invalid", code: "unregistered" };
  if (code === "MessageRateExceeded")
    return { result: receipt ? "resend" : "retry", code: "transient" };
  if (["InvalidCredentials", "MismatchSenderId"].includes(code ?? ""))
    return { result: "failed", code: "credentials" };
  return {
    result: "failed",
    code:
      code === "MessageTooBig" ? "invalid_payload" : "unknown_provider_error",
  };
}
export async function deliverExpo(
  delivery: NonNullable<z.infer<typeof deliverySchema>>,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Outcome> {
  if (delivery.phase === "receipt" && !delivery.ticketId)
    return { result: "failed", code: "invalid_payload" };
  const path = delivery.phase === "send" ? "send" : "getReceipts";
  let response: Response;
  try {
    response = await fetcher(`https://exp.host/--/api/v2/push/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(
        delivery.phase === "send"
          ? privacySafeMessage(delivery.pushToken)
          : { ids: [delivery.ticketId] },
      ),
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { result: "retry", code: "transient" };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return response.status === 429 || response.status >= 500
      ? { result: "retry", code: "transient" }
      : {
          result: "failed",
          code: [401, 403].includes(response.status)
            ? "credentials"
            : "invalid_payload",
        };
  }
  let raw: unknown;
  try {
    raw = await boundedJson(response, 16_384);
  } catch {
    return { result: "retry", code: "transient" };
  }
  if (delivery.phase === "send") {
    const parsed = z.object({ data: expoResult }).safeParse(raw);
    if (!parsed.success) return { result: "retry", code: "transient" };
    if (parsed.data.data.status === "error")
      return errorOutcome(parsed.data.data.details?.error);
    return parsed.data.data.id
      ? { result: "sent", ticket: parsed.data.data.id }
      : { result: "retry", code: "transient" };
  }
  const parsed = z
    .object({ data: z.record(z.string(), expoResult) })
    .safeParse(raw);
  if (!parsed.success) return { result: "retry", code: "transient" };
  const receipt = parsed.data.data[delivery.ticketId!];
  if (!receipt) return { result: "missing", code: "receipt_missing" };
  return receipt.status === "ok"
    ? { result: "accepted" }
    : errorOutcome(receipt.details?.error, true);
}

export async function processNotifications(
  env: Env,
  database?: NativeDatabase,
  fetcher: typeof fetch = fetch,
) {
  // Separate from the imaging and purchase queues. Disabled means no DB/network calls.
  if (env.MOBILE_NOTIFICATIONS_ENABLED !== "true") return;
  const scope = configuration(env, true);
  const db = database ?? new NativeDatabase(env);
  const claimed = await db.rpc(
    "claim_mobile_push_deliveries",
    scope,
    claimedSchema,
  );
  let errors = 0;
  for (const claim of claimed) {
    try {
      const params = { ...scope, p_id: claim.id, p_lease: claim.leaseId };
      // Re-check account, device version, lease and job immediately before sending.
      const delivery = await db.rpc(
        "read_mobile_push_delivery",
        params,
        deliverySchema,
      );
      if (!delivery) continue;
      const outcome = await deliverExpo(delivery, env, fetcher);
      await db.rpc(
        "finish_mobile_push_delivery",
        {
          ...params,
          p_result: outcome.result,
          p_ticket: outcome.ticket ?? null,
          p_code: outcome.code ?? null,
        },
        z.null(),
      );
      if (outcome.result === "failed") errors++;
    } catch {
      errors++; /* Durable lease expires for retry; never log a token, body or provider response. */
    }
  }
  console.log(
    JSON.stringify({
      service: "furnio-mobile-notifications",
      processed: claimed.length,
      errors,
    }),
  );
}
