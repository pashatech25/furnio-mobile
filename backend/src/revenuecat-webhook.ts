import { z } from "zod";
import { boundedBytes, HttpError, secureEqual } from "./http";

const timestamp = z.number().int().safe().nonnegative();
const id = z.string().min(1).max(512);
export const nativeEventSchema = z.object({
  id,
  type: z.string().min(1).max(80),
  app_id: id,
  event_timestamp_ms: timestamp,
  app_user_id: z.uuid(),
  original_app_user_id: z.string().max(512),
  aliases: z.array(z.string().max(512)).max(100).default([]),
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  store: z.enum(["APP_STORE", "PLAY_STORE"]),
  product_id: id,
  transaction_id: id,
  original_transaction_id: id,
  purchased_at_ms: timestamp,
  expiration_at_ms: timestamp.nullable(),
  period_type: z.enum(["TRIAL", "INTRO", "NORMAL", "PROMOTIONAL", "PREPAID"]),
  is_family_share: z.boolean(),
  cancel_reason: z.string().max(80).optional(),
  grace_period_expiration_at_ms: timestamp.nullable().optional(),
  price_in_purchased_currency: z.number().finite().nullable().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  quantity: z.number().int().positive().optional(),
});
export type NativeEvent = z.infer<typeof nativeEventSchema>;

export async function verifyWebhook(
  request: Request,
  config: {
    authorization: string;
    signingSecret: string;
    appIds: readonly string[];
    environment: "SANDBOX" | "PRODUCTION";
  },
  now = Date.now(),
): Promise<{ event: NativeEvent; bodyHash: string }> {
  if (
    config.authorization.length < 32 ||
    config.signingSecret.length < 32 ||
    !config.appIds.length
  )
    throw new HttpError(503, "Native webhook verification is not configured.");
  const authorization = request.headers.get("Authorization") ?? "";
  if (
    authorization.length > 1024 ||
    !(await secureEqual(authorization, config.authorization))
  )
    throw new HttpError(401, "Invalid webhook authorization.");
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "JSON is required.");
  const signed = request.headers.get("X-RevenueCat-Webhook-Signature") ?? "";
  const match = /^t=(\d{1,12}),v1=([a-fA-F0-9]{64})$/.exec(signed);
  if (
    !match ||
    !match[1] ||
    !match[2] ||
    Math.abs(now / 1000 - Number(match[1])) > 300
  )
    throw new HttpError(401, "Invalid webhook signature.");
  const bytes = await boundedBytes(request.body, 131_072);
  const prefix = new TextEncoder().encode(`${match[1]}.`);
  const signedBytes = new Uint8Array(prefix.length + bytes.length);
  signedBytes.set(prefix);
  signedBytes.set(bytes, prefix.length);
  const signature = Uint8Array.from(match[2].match(/.{2}/g) ?? [], (v) =>
    parseInt(v, 16),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (!(await crypto.subtle.verify("HMAC", key, signature, signedBytes)))
    throw new HttpError(401, "Invalid webhook signature.");
  let raw: unknown;
  try {
    raw = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    throw new HttpError(400, "Invalid webhook JSON.");
  }
  const parsed = z
    .object({ api_version: z.literal("1.0"), event: nativeEventSchema })
    .safeParse(raw);
  if (!parsed.success)
    throw new HttpError(422, "Unsupported native event format.");
  const event = parsed.data.event;
  if (
    !config.appIds.includes(event.app_id) ||
    event.environment !== config.environment
  )
    throw new HttpError(403, "Wrong native app or store environment.");
  // Do not infer identity from matching email/name, RevenueCat aliases or family
  // sharing. Store restore transfer is configured as keep-with-original-user.
  if (
    event.is_family_share ||
    event.original_app_user_id !== event.app_user_id ||
    event.aliases.some(
      (alias) =>
        z.uuid().safeParse(alias).success && alias !== event.app_user_id,
    )
  )
    throw new HttpError(409, "Purchase identity requires manual review.");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return {
    event,
    bodyHash: [...new Uint8Array(hash)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join(""),
  };
}
