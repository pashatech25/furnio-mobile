import { z } from "zod";
import { boundedBytes, HttpError } from "./http";
import { NativeDatabase, nativeConfiguration } from "./native-events";
import { RevenueCatVerifier } from "./revenuecat";

const statusSchema = z.object({
  status: z.enum([
    "not_started",
    "no_purchases_found",
    "pending",
    "needs_review",
    "synchronized",
  ]),
  checkedAt: z.string().nullable(),
});
const startedSchema = statusSchema.extend({
  runId: z.uuid(),
  enqueue: z.boolean(),
});
const claimSchema = z.object({
  userId: z.uuid(),
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  phase: z.enum(["discovering", "dispatching"]),
  cursor: z.string().nullable(),
  leaseId: z.uuid(),
  eventIds: z.array(z.string().min(1).max(512)).max(20),
});

export async function requestRecovery(
  request: Request,
  userId: string,
  env: Env,
  database = new NativeDatabase(env),
) {
  const config = nativeConfiguration(env);
  if (request.method === "GET")
    return database.rpc(
      "get_native_recovery_status",
      {
        p_user: userId,
        p_environment: config.environment,
      },
      statusSchema,
    );
  if (
    request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "JSON is required.");
  const bytes = await boundedBytes(request.body, 1024);
  let body: unknown;
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    throw new HttpError(400, "An empty JSON object is required.");
  }
  // No client-selected identity, transaction, product, credit quantity or cursor.
  if (!z.object({}).strict().safeParse(body).success)
    throw new HttpError(
      400,
      "Purchase recovery accepts no client payment claims.",
    );
  const result = await database.rpc(
    "begin_native_purchase_recovery",
    {
      p_user: userId,
      p_environment: config.environment,
    },
    startedSchema,
  );
  if (result.enqueue)
    await env.NATIVE_EVENTS.send(
      { recoveryId: result.runId },
      { contentType: "json" },
    );
  return { status: result.status, checkedAt: result.checkedAt };
}

/** One leased page per message. Commit cursor only after durable inbox writes;
 * commit dispatch only after awaited queue acceptance. Retrying either is safe. */
export async function processRecovery(
  runId: string,
  env: Env,
  database = new NativeDatabase(env),
  verifier?: RevenueCatVerifier,
) {
  const config = nativeConfiguration(env);
  const claim = await database.rpc(
    "claim_native_purchase_recovery",
    { p_run: runId },
    claimSchema.nullable(),
  );
  if (!claim) return;
  if (claim.environment !== config.environment)
    throw new HttpError(409, "Recovery environment mismatch.");
  if (claim.phase === "discovering") {
    const trusted =
      verifier ??
      new RevenueCatVerifier({
        projectId: env.REVENUECAT_PROJECT_ID,
        apiKey: env.REVENUECAT_SECRET_API_KEY,
        appIds: config.appIds,
      });
    const page = await trusted.customerEventPage(
      claim.userId,
      claim.environment,
      claim.cursor,
    );
    await database.rpc(
      "save_native_recovery_page",
      {
        p_run: runId,
        p_lease: claim.leaseId,
        p_events: page.events,
        p_next_cursor: page.nextCursor,
        p_issues: page.issues,
      },
      z.null(),
    );
  } else {
    if (claim.eventIds.length)
      await env.NATIVE_EVENTS.sendBatch(
        claim.eventIds.map((eventId) => ({
          body: { eventId },
          contentType: "json" as const,
        })),
      );
    await database.rpc(
      "finish_native_recovery_dispatch",
      {
        p_run: runId,
        p_lease: claim.leaseId,
        p_last_event: claim.eventIds.at(-1) ?? null,
      },
      z.null(),
    );
    if (!claim.eventIds.length) return;
  }
  await env.NATIVE_EVENTS.send({ recoveryId: runId }, { contentType: "json" });
}
