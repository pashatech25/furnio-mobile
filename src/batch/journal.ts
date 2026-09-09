import { z } from "zod";
import { secureStorage } from "../auth/secure-storage";
const schema = z.object({
  version: z.literal(1),
  userId: z.uuid(),
  projectId: z.uuid(),
  idempotencyKey: z.string().min(16),
  startedAt: z.number(),
  batchId: z.uuid().nullable(),
  expiresAt: z.string().nullable(),
  jobIds: z.array(z.uuid()).max(50),
  phase: z.enum(["reserving", "uploading", "finished", "needs_review"]),
});
export type BatchJournal = z.infer<typeof schema>;
const key = (userId: string) =>
  `furnio.batch-recovery.${z.uuid().parse(userId)}`;
export async function saveBatchJournal(journal: BatchJournal) {
  await secureStorage.setItem(
    key(journal.userId),
    JSON.stringify(schema.parse(journal)),
  );
}
export async function loadBatchJournal(userId: string) {
  const raw = await secureStorage.getItem(key(userId));
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "Batch recovery is unreadable. Check project history before starting a new batch.",
    );
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data.userId !== userId)
    throw new Error(
      "Batch recovery is incompatible. Check your project before starting another batch.",
    );
  return parsed.data;
}
export async function clearBatchJournal(userId: string) {
  await secureStorage.removeItem(key(userId));
}
