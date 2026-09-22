import { z } from "zod";
import { NativeDatabase, nativeConfiguration, customerStoreContext } from "./native-events";
import { RevenueCatVerifier } from "./revenuecat";

const claimSchema = z
  .object({
    leaseId: z.uuid(),
    store: z.enum(["APP_STORE", "PLAY_STORE"]),
    kind: z.enum(["consumable", "subscription"]),
    launchedAt: z.iso.datetime({ offset: true }),
  })
  .nullable();

/** Caller identity is established by the customer route, never the request body.
 * The RPC's disabled gate, lease and final lock limit repeated provider reads.
 * No client-supplied payment outcome can grant, reverse or delete any credits.
 */
export async function checkSdkCancellation(
  userId: string,
  intentId: string,
  env: Env,
  database: NativeDatabase,
  verifier?: Pick<RevenueCatVerifier, "hasCancellationConflict">,
) {
  const config = nativeConfiguration(env);
  const context = await customerStoreContext(userId, env, database);
  const base = {
    p_user: userId,
    p_environment: context.environment,
    p_intent: intentId,
  };
  const claim = await database.rpc(
    context.enrolled ? "claim_sandbox_checkout_cancellation" : "claim_native_checkout_cancellation",
    base,
    claimSchema,
  );
  if (!claim) return;
  let observation: "clear_snapshot" | "conflict" | "unavailable" =
    "unavailable";
  try {
    const trusted =
      verifier ??
      new RevenueCatVerifier({
        projectId: env.REVENUECAT_PROJECT_ID,
        apiKey: env.REVENUECAT_SECRET_API_KEY,
        appIds: config.appIds,
      });
    observation = (await trusted.hasCancellationConflict({
      userId,
      environment: context.environment,
      store: claim.store,
      kind: claim.kind,
      launchedAt: claim.launchedAt,
    }))
      ? "conflict"
      : "clear_snapshot";
  } catch {
    // No provider payload, credential, receipt, URL or error text is persisted.
    // An unavailable check cannot release the intent. A retry needs a new lease.
  }
  await database.rpc(
    context.enrolled ? "finish_sandbox_checkout_cancellation" : "finish_native_checkout_cancellation",
    {
      ...base,
      p_lease: claim.leaseId,
      p_observation: observation,
    },
    z.boolean(),
  );
}
