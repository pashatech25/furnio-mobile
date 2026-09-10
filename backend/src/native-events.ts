import { z } from "zod";
import { boundedJson, HttpError } from "./http";
import { nativeEventSchema, verifyWebhook } from "./revenuecat-webhook";
import { RevenueCatVerifier } from "./revenuecat";
import { processRecovery } from "./recovery";

export const nativeQueueMessage = z.union([
  z.object({ eventId: z.string().min(1).max(512) }).strict(),
  z.object({ recoveryId: z.uuid() }).strict(),
]);
const acceptedSchema = z.object({
  eventId: z.string(),
  state: z.enum(["pending", "completed", "quarantined"]),
});
const storedSchema = z.object({
  event: nativeEventSchema,
  state: z.enum(["pending", "completed", "quarantined"]),
  kind: z.enum(["consumable", "subscription"]).nullable(),
  recoveryReady: z.boolean().default(true),
  refundKnown: z.boolean().default(false),
});
const voidSchema = z.null();
type NativeRpc =
  | "claim_mobile_account_auth_block"
  | "finish_mobile_account_auth_block"
  | "claim_mobile_account_media_cleanup"
  | "finish_mobile_account_media_cleanup"
  | "get_mobile_account_deletion_review"
  | "manage_mobile_account_deletion_request"
  | "manage_mobile_push_device"
  | "claim_mobile_push_deliveries"
  | "read_mobile_push_delivery"
  | "finish_mobile_push_delivery"
  | "begin_customer_purchase_intent"
  | "launch_customer_purchase_intent"
  | "read_native_purchase_intent"
  | "recover_native_purchase_selection"
  | "cancel_unlaunched_purchase_intent"
  | "claim_native_checkout_cancellation"
  | "finish_native_checkout_cancellation"
  | "accept_verified_native_webhook"
  | "get_native_purchase_event"
  | "apply_verified_native_event"
  | "note_native_purchase_event_failure"
  | "get_mobile_billing_snapshot"
  | "get_mobile_activity"
  | "get_native_recovery_status"
  | "begin_native_purchase_recovery"
  | "claim_native_purchase_recovery"
  | "save_native_recovery_page"
  | "finish_native_recovery_dispatch";

export function storeEnvironment(env: Pick<Env, "ENVIRONMENT">) {
  if (env.ENVIRONMENT === "staging") return "SANDBOX" as const;
  if (env.ENVIRONMENT === "production") return "PRODUCTION" as const;
  throw new HttpError(503, "Unknown native store environment.");
}
export function nativeConfiguration(env: Env) {
  if (env.NATIVE_RECONCILIATION_ENABLED !== "true")
    throw new HttpError(503, "Native reconciliation is not enabled.");
  const appIds = env.REVENUECAT_APP_IDS.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!appIds.length || appIds.some((v) => !/^[a-zA-Z0-9_-]{3,100}$/.test(v)))
    throw new HttpError(503, "Approved native app IDs are not configured.");
  return { appIds, environment: storeEnvironment(env) };
}

export class NativeDatabase {
  private readonly base: string;
  constructor(
    private readonly env: Env,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!/^[a-z0-9]{20}$/.test(env.SUPABASE_PROJECT_REF))
      throw new HttpError(503, "Native database is not configured.");
    const expected = `https://${env.SUPABASE_PROJECT_REF}.supabase.co`;
    if (
      env.SUPABASE_URL.replace(/\/$/, "") !== expected ||
      !env.SUPABASE_SERVICE_ROLE_KEY ||
      !(
        env.SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_") ||
        env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")
      )
    )
      throw new HttpError(
        503,
        "Native database credentials are not configured.",
      );
    // Staging must never target the recorded production Supabase project.
    if (
      env.ENVIRONMENT !== "production" &&
      env.SUPABASE_PROJECT_REF === "sgsjkgfwgxmlqcgyuyeh"
    )
      throw new HttpError(
        503,
        "Production database access from staging is prohibited.",
      );
    this.base = expected;
  }
  async rpc<T>(
    method: NativeRpc,
    body: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const key = this.env.SUPABASE_SERVICE_ROLE_KEY;
    // workerd's native fetch requires the global receiver, not this adapter.
    const response = await this.fetcher.call(
      globalThis,
      `${this.base}/rest/v1/rpc/${method}`,
      {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(body),
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      // Do not expose SQL errors, body, account identifiers or privileged URLs.
      let code: string | undefined;
      try {
        code = z
          .object({ code: z.string() })
          .safeParse(await boundedJson(response, 16_384)).data?.code;
      } catch {
        /* Missing/invalid error bodies remain retriable, never a success. */
      }
      throw new HttpError(
        code && ["42501", "23505", "22023", "23514"].includes(code) ? 409 : 503,
        method.includes("account_deletion")
          ? "Account deletion review could not be verified. Sign in again and retry."
          : method.includes("push")
            ? "Notification settings or delivery could not be updated."
            : "Native transaction could not be reconciled.",
      );
    }
    // PostgREST SQL void functions may return an empty body or JSON null.
    if (response.status === 204) return schema.parse(null);
    const result = schema.safeParse(await boundedJson(response, 131_072));
    if (!result.success)
      throw new HttpError(502, "Native database response is incompatible.");
    return result.data;
  }
}

export async function receiveNativeWebhook(request: Request, env: Env) {
  const config = nativeConfiguration(env);
  const { event, bodyHash } = await verifyWebhook(request, {
    ...config,
    authorization: env.REVENUECAT_WEBHOOK_AUTHORIZATION,
    signingSecret: env.REVENUECAT_WEBHOOK_SIGNING_SECRET,
  });
  const database = new NativeDatabase(env);
  const saved = await database.rpc(
    "accept_verified_native_webhook",
    { p_event: { ...event, aliases: [] }, p_body_hash: bodyHash },
    acceptedSchema,
  );
  if (saved.state === "pending") {
    // Await queue acceptance. If it fails, return non-2xx so RevenueCat retries;
    // the durable database inbox prevents loss and duplicate credit delivery.
    await env.NATIVE_EVENTS.send(
      { eventId: saved.eventId },
      { contentType: "json" },
    );
  }
  return { accepted: true, state: saved.state };
}

export async function processNativeEvent(
  eventId: string,
  env: Env,
  database = new NativeDatabase(env),
  verifier?: RevenueCatVerifier,
) {
  const config = nativeConfiguration(env);
  const stored = await database.rpc(
    "get_native_purchase_event",
    { p_id: eventId },
    storedSchema.nullable(),
  );
  if (!stored) throw new HttpError(503, "Native event not yet available.");
  if (stored.state !== "pending") return;
  if (stored.recoveryReady === false)
    throw new HttpError(
      503,
      "Complete purchase history needs verification first.",
    );
  try {
    if (
      stored.event.environment !== config.environment ||
      !config.appIds.includes(stored.event.app_id)
    )
      throw new HttpError(409, "Native environment or app mismatch.");
    if (!stored.kind)
      throw new HttpError(409, "Native product mapping requires review.");
    const trusted =
      verifier ??
      new RevenueCatVerifier({
        projectId: env.REVENUECAT_PROJECT_ID,
        apiKey: env.REVENUECAT_SECRET_API_KEY,
        appIds: config.appIds,
      });
    const verified = await trusted.verify(stored.event, stored.kind, {
      refundKnown: stored.refundKnown === true,
    });
    await database.rpc(
      "apply_verified_native_event",
      { p_id: eventId, p_verified: verified },
      z.object({ duplicate: z.boolean() }),
    );
  } catch (error) {
    const quarantine = error instanceof HttpError && error.status === 409;
    await database.rpc(
      "note_native_purchase_event_failure",
      {
        p_id: eventId,
        p_code: quarantine
          ? "identity_or_product_review"
          : "verification_unavailable",
        p_quarantine: quarantine,
      },
      voidSchema,
    );
    if (!quarantine) throw error;
    // Persisted quarantine is visible to Admin follow-up; never silently grant
    // or discard an ambiguous transfer, family purchase or unknown product.
  }
}

export async function consumeNativeEvents(
  batch: MessageBatch<unknown>,
  env: Env,
) {
  for (const message of batch.messages) {
    try {
      const parsed = nativeQueueMessage.safeParse(message.body);
      if (!parsed.success) {
        // Internal malformed message: leave for DLQ inspection, without logging its body.
        message.retry({ delaySeconds: 300 });
        continue;
      }
      if ("recoveryId" in parsed.data)
        await processRecovery(parsed.data.recoveryId, env);
      else await processNativeEvent(parsed.data.eventId, env);
      message.ack();
    } catch {
      message.retry({
        delaySeconds: Math.min(60 * 2 ** Math.min(message.attempts, 6), 3600),
      });
    }
  }
}
