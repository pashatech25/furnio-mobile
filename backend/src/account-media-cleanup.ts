import { z } from "zod";
import { NativeDatabase, storeEnvironment } from "./native-events";

const pageLimit = 200;
const leaseSchema = z.object({
  scopeId: z.uuid(),
  requestId: z.uuid(),
  userId: z.uuid(),
  jobId: z.uuid().nullable(),
  kind: z.enum(["input", "output", "mask", "job"]),
  prefix: z.string().min(1).max(100),
  leaseId: z.uuid(),
  leaseExpiresAt: z.iso.datetime({ offset: true }),
});
const pageSchema = z.object({
  objects: z
    .array(z.object({ key: z.string().min(1).max(4096) }))
    .max(pageLimit),
  truncated: z.boolean(),
  delimitedPrefixes: z.array(z.string()).max(0).optional(),
});
type Lease = z.infer<typeof leaseSchema>;
type Outcome =
  | "empty"
  | "deleted_page"
  | "storage_unavailable"
  | "scope_mismatch";
type MediaBucket = Pick<R2Bucket, "list" | "delete">;

function expectedPrefix(lease: Lease) {
  if (lease.kind === "job") return lease.jobId ? `tmp/${lease.jobId}/` : null;
  if (lease.jobId !== null) return null;
  if (lease.kind === "input") return `in/${lease.userId}/`;
  if (lease.kind === "output") return `out/${lease.userId}/`;
  return `tmp/masks/${lease.userId}/`;
}

/** One exact, server-owned prefix and one bounded page. Never a whole bucket.
 * Re-list from the beginning after deletion: advancing a cursor through a
 * changing result set can skip objects. Empty is only an untruncated empty list.
 * null leaves the lease to expire rather than acknowledging stale work.
 */
export async function drainAccountMediaPage(
  input: unknown,
  bucket: MediaBucket,
  now: () => number = Date.now,
): Promise<Outcome | null> {
  const parsed = leaseSchema.safeParse(input);
  if (!parsed.success) return "scope_mismatch";
  const lease = parsed.data;
  const prefix = expectedPrefix(lease);
  if (!prefix || prefix !== lease.prefix) return "scope_mismatch";
  const expires = Date.parse(lease.leaseExpiresAt);
  const fresh = () => expires > now() + 5_000 && expires <= now() + 125_000;
  if (!fresh()) return null;
  try {
    const page = pageSchema.safeParse(
      await bucket.list({ prefix, limit: pageLimit }),
    );
    if (!page.success) return "storage_unavailable";
    // Validate the entire page before deleting ANY member of it. Never accept
    // a storage adapter bug that returns another customer's key.
    const keys = page.data.objects.map((object) => object.key);
    if (keys.some((key) => !key.startsWith(prefix))) return "scope_mismatch";
    if (!fresh()) return null;
    if (!keys.length)
      return page.data.truncated ? "storage_unavailable" : "empty";
    await bucket.delete([...new Set(keys)]);
    // An ambiguous/late acknowledgement is safe to retry: deletion is idempotent.
    return fresh() ? "deleted_page" : null;
  } catch {
    // Do not leak object names, URLs, account IDs, photos or provider errors.
    return "storage_unavailable";
  }
}

export async function processAccountMediaCleanup(
  env: Env,
  providedDatabase?: NativeDatabase,
  now: () => number = Date.now,
) {
  if (env.MOBILE_ACCOUNT_CLEANUP_ENABLED !== "true") return;
  if (!env.ACCOUNT_MEDIA) throw new Error("Account media storage unavailable");
  const environment = storeEnvironment(env);
  const database = providedDatabase ?? new NativeDatabase(env);
  // Independent of new-app-entry and purchase flags. Already accepted deletions
  // need cleanup during rollback. The explicit cleanup flag is an emergency stop.
  // The SQL claim separately enforces its disabled-by-default environment gate.
  for (let index = 0; index < 5; index++) {
    const lease = await database.rpc(
      "claim_mobile_account_media_cleanup",
      { p_environment: environment },
      leaseSchema.nullable(),
    );
    if (!lease) return;
    const outcome = await drainAccountMediaPage(lease, env.ACCOUNT_MEDIA, now);
    if (outcome === null) return;
    await database.rpc(
      "finish_mobile_account_media_cleanup",
      {
        p_environment: environment,
        p_scope: lease.scopeId,
        p_lease: lease.leaseId,
        p_result: outcome,
      },
      z.null(),
    );
    // Back off a storage failure instead of amplifying one outage. A bad scope
    // is durable, visible in its record and retried only after the SQL delay.
    if (outcome === "storage_unavailable" || outcome === "scope_mismatch")
      return;
  }
}
