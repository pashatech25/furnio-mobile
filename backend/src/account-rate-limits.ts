import { z } from "zod";
import { HttpError } from "./http";

type LimitEnvironment = Pick<
  Env,
  | "ENVIRONMENT"
  | "ACCOUNT_DELETION_LIMIT_SECRET"
  | "ACCOUNT_DELETION_SOURCE_LIMIT"
  | "ACCOUNT_DELETION_USER_LIMIT"
  | "ACCOUNT_DELETION_RECEIPT_LIMIT"
>;
const unavailable = () =>
  new HttpError(
    503,
    "Account privacy service is temporarily unavailable. Please try again later.",
  );
const ipv4 = z.ipv4();
const ipv6 = z.ipv6();

export class AccountPrivacyRateLimitError extends HttpError {
  readonly retryAfter = 60;
  constructor() {
    super(
      429,
      "Too many account privacy requests. Please wait one minute and try again.",
    );
  }
}

export function accountPrivacyLimitsReady(env: LimitEnvironment): boolean {
  return (
    ["staging", "production"].includes(env.ENVIRONMENT) &&
    typeof env.ACCOUNT_DELETION_LIMIT_SECRET === "string" &&
    env.ACCOUNT_DELETION_LIMIT_SECRET.length === 64 &&
    /^[a-f0-9]{64}$/.test(env.ACCOUNT_DELETION_LIMIT_SECRET ?? "") &&
    [
      env.ACCOUNT_DELETION_SOURCE_LIMIT,
      env.ACCOUNT_DELETION_USER_LIMIT,
      env.ACCOUNT_DELETION_RECEIPT_LIMIT,
    ].every((binding) => typeof binding?.limit === "function")
  );
}

function connectingAddress(request: Request): string {
  // This entry point must be served directly by Cloudflare. Never fall back to
  // client-controlled X-Forwarded-For, a body selector, or a shared "unknown" key.
  const address = request.headers.get("CF-Connecting-IP") ?? "";
  if (ipv4.safeParse(address).success) return address;
  if (!address.includes("%") && ipv6.safeParse(address).success) {
    const normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1);
    // IPv4-mapped IPv6 and the equivalent IPv4 address share a counter.
    const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(normalized);
    if (mapped) {
      const high = parseInt(mapped[1]!, 16),
        low = parseInt(mapped[2]!, 16);
      return [high >> 8, high & 255, low >> 8, low & 255].join(".");
    }
    return normalized;
  }
  throw unavailable();
}

// Cloudflare's counters are approximate and per location. They are an abuse
// brake only: SQL still owns authorization, exact quotas and idempotency.
async function enforce(binding: RateLimit, key: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let outcome: RateLimitOutcome;
  try {
    outcome = await Promise.race([
      binding.limit({ key }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(unavailable()), 1000);
      }),
    ]);
  } catch {
    // Do not expose upstream messages; they may contain the keyed identifier.
    throw unavailable();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  if (outcome?.success === false) throw new AccountPrivacyRateLimitError();
  if (outcome?.success !== true) throw unavailable();
}

export async function beginAccountPrivacyLimits(
  request: Request,
  env: LimitEnvironment,
) {
  if (!accountPrivacyLimitsReady(env)) throw unavailable();
  const address = connectingAddress(request);
  // Per-request key, no global secrets/counters, and no visitor database rows.
  const secret = Uint8Array.from(
    env.ACCOUNT_DELETION_LIMIT_SECRET.match(/../g)!,
    (byte) => parseInt(byte, 16),
  );
  const hmac = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  async function key(scope: "source" | "user" | "receipt", identity: string[]) {
    const signature = await crypto.subtle.sign(
      "HMAC",
      hmac,
      new TextEncoder().encode(
        JSON.stringify([
          "furnio-mobile-account-privacy-v1",
          env.ENVIRONMENT,
          scope,
          ...identity,
        ]),
      ),
    );
    return Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }
  // Coarse, generous source limit before Auth/database/body reads. User and
  // receipt limits below are the primary controls, including on shared Wi-Fi.
  await enforce(
    env.ACCOUNT_DELETION_SOURCE_LIMIT,
    await key("source", [address]),
  );
  return {
    async user(userId: string) {
      // Caller supplies only the server-verified identity, never a decoded JWT.
      await enforce(
        env.ACCOUNT_DELETION_USER_LIMIT,
        await key("user", [userId.toLowerCase()]),
      );
    },
    async receipt(requestId: string, receiptSecret: string) {
      // Key the entire validated capability. Knowing a request UUID must not
      // allow an attacker to exhaust the real receipt holder's counter.
      await enforce(
        env.ACCOUNT_DELETION_RECEIPT_LIMIT,
        await key("receipt", [requestId.toLowerCase(), receiptSecret]),
      );
    },
  };
}
