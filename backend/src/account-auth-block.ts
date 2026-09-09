import { z } from "zod";
import { boundedJson } from "./http";
import { NativeDatabase, storeEnvironment } from "./native-events";

const leaseSchema = z
  .object({
    requestId: z.uuid(),
    userId: z.uuid(),
    action: z.literal("block_sign_in"),
    leaseId: z.uuid(),
    leaseExpiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const userSchema = z.object({
  id: z.uuid(),
  banned_until: z.iso.datetime({ offset: true }).nullable().optional(),
  deleted_at: z.iso.datetime({ offset: true }).nullable().optional(),
});
type Outcome = "blocked" | "auth_unavailable" | "identity_mismatch";
const year = 365 * 24 * 60 * 60 * 1000;

/** Supported Auth admin operation only. A ban is NOT logout or deletion.
 * The database-issued lease can only target a confirmed, permanently fenced
 * account. No email lookup, account creation, hard delete or metadata rewrite.
 */
export async function blockAccountSignIn(
  input: unknown,
  env: Env,
  fetcher: typeof fetch = fetch,
  now = Date.now,
): Promise<Outcome | null> {
  if (
    env.MOBILE_ACCOUNT_CLEANUP_ENABLED !== "true" ||
    env.MOBILE_ACCOUNT_AUTH_BLOCK_ENABLED !== "true"
  )
    return null;
  const parsed = leaseSchema.safeParse(input);
  if (!parsed.success) return "identity_mismatch";
  const lease = parsed.data;
  const expires = Date.parse(lease.leaseExpiresAt);
  const fresh = () => expires > now() + 5_000 && expires <= now() + 125_000;
  if (!fresh()) return null;
  try {
    storeEnvironment(env);
    // Reuse the existing strict project/key/staging-origin checks. Constructor
    // performs no I/O. Never follow a redirect carrying an administrative key.
    new NativeDatabase(env, fetcher);
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const url = `https://${env.SUPABASE_PROJECT_REF}.supabase.co/auth/v1/admin/users/${lease.userId}`;
    const read = async (method: "GET" | "PUT") => {
      const response = await fetcher(url, {
        method,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: {
          apikey: key,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
        },
        // 100 x 365 days. Never send "none", a password or provider metadata.
        ...(method === "PUT"
          ? { body: JSON.stringify({ ban_duration: "876000h" }) }
          : {}),
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new Error("Auth unavailable");
      }
      return userSchema.parse(await boundedJson(response, 32_768));
    };
    let user = await read("GET");
    if (user.id !== lease.userId || user.deleted_at) return "identity_mismatch";
    if (!fresh()) return null;
    if (!user.banned_until || Date.parse(user.banned_until) < now() + year) {
      user = await read("PUT");
      if (user.id !== lease.userId || user.deleted_at)
        return "identity_mismatch";
      if (!fresh()) return null;
      user = await read("GET"); // Read-back handles response/write ambiguity.
      if (user.id !== lease.userId || user.deleted_at)
        return "identity_mismatch";
    }
    if (!fresh()) return null;
    return user.banned_until && Date.parse(user.banned_until) >= now() + year
      ? "blocked"
      : "auth_unavailable";
  } catch {
    // No upstream JSON, identities, credentials or personal metadata in logs.
    return "auth_unavailable";
  }
}

export async function processAccountAuthBlocks(
  env: Env,
  providedDatabase?: NativeDatabase,
  fetcher: typeof fetch = fetch,
  now = Date.now,
) {
  if (
    env.MOBILE_ACCOUNT_CLEANUP_ENABLED !== "true" ||
    env.MOBILE_ACCOUNT_AUTH_BLOCK_ENABLED !== "true"
  )
    return;
  const environment = storeEnvironment(env);
  const database = providedDatabase ?? new NativeDatabase(env);
  for (let index = 0; index < 5; index++) {
    const lease = await database.rpc(
      "claim_mobile_account_auth_block",
      { p_environment: environment },
      leaseSchema.nullable(),
    );
    if (!lease) return;
    const result = await blockAccountSignIn(lease, env, fetcher, now);
    if (result === null) return; // Lease expires; do not acknowledge stale work.
    const verified = await database.rpc(
      "finish_mobile_account_auth_block",
      {
        p_environment: environment,
        p_request: lease.requestId,
        p_lease: lease.leaseId,
        p_result: result,
      },
      z.boolean(),
    );
    if (!verified || result !== "blocked") return;
  }
}
