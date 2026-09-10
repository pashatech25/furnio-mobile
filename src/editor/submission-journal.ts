import { z } from "zod";
import { serviceIds } from "../service-ids";

export const submissionReceiptSchema = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    userId: z.uuid(),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    projectId: z.uuid(),
    service: z.enum(serviceIds),
    startedAt: z.number().int().nonnegative(),
    sourceIds: z.array(z.uuid()).min(1).max(4),
    referenceIds: z.array(z.uuid()).max(5),
    anchorId: z.uuid().nullable(),
  })
  .strict()
  .refine((value) => {
    const ids = [...value.sourceIds, ...value.referenceIds];
    return (
      new Set(ids).size === ids.length &&
      (value.service === "multiview"
        ? value.sourceIds.length >= 2 &&
          value.anchorId !== null &&
          value.sourceIds.includes(value.anchorId)
        : value.sourceIds.length === 1 && value.anchorId === null) &&
      (value.service === "reference_furniture"
        ? value.referenceIds.length >= 1
        : value.referenceIds.length === 0)
    );
  });
export type SubmissionReceipt = z.infer<typeof submissionReceiptSchema>;
export interface ReceiptStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export class ReceiptError extends Error {
  constructor() {
    super(
      "The previous submission receipt needs checking. Open project history or contact support before submitting again.",
    );
  }
}

/** One unresolved Studio submission per account/environment on this device.
 * Single bounded native item: malformed/truncated values must not look empty.
 */
export function createSubmissionJournal(storage: ReceiptStorage) {
  const queues = new Map<string, Promise<unknown>>();
  function key(scope: string, userId: string) {
    z.string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(scope);
    z.uuid().parse(userId);
    return `furnio.studio-receipt.${scope}.${userId}`;
  }
  function serial<T>(name: string, action: () => Promise<T>): Promise<T> {
    const next = (queues.get(name) ?? Promise.resolve())
      .catch(() => undefined)
      .then(action);
    queues.set(name, next);
    void next
      .finally(() => {
        if (queues.get(name) === next) queues.delete(name);
      })
      .catch(() => undefined);
    return next;
  }
  async function read(scope: string, userId: string) {
    try {
      const raw = await storage.getItem(key(scope, userId));
      if (raw === null) return null;
      if (new TextEncoder().encode(raw).length > 1800) throw new ReceiptError();
      const receipt = submissionReceiptSchema.parse(JSON.parse(raw));
      if (receipt.scope !== scope || receipt.userId !== userId)
        throw new ReceiptError();
      return receipt;
    } catch {
      throw new ReceiptError();
    }
  }
  return {
    load: (scope: string, userId: string) =>
      serial(key(scope, userId), () => read(scope, userId)),
    claim: (input: SubmissionReceipt) =>
      serial(key(input.scope, input.userId), async () => {
        const receipt = submissionReceiptSchema.parse(input);
        if (await read(receipt.scope, receipt.userId)) throw new ReceiptError();
        const raw = JSON.stringify(receipt);
        if (new TextEncoder().encode(raw).length > 1800)
          throw new ReceiptError();
        await storage.setItem(key(receipt.scope, receipt.userId), raw);
        if (JSON.stringify(await read(receipt.scope, receipt.userId)) !== raw)
          throw new ReceiptError();
        return receipt;
      }),
    // Compare-and-delete only. Old callbacks must never remove a newer intent.
    clear: (receipt: SubmissionReceipt) =>
      serial(key(receipt.scope, receipt.userId), async () => {
        const current = await read(receipt.scope, receipt.userId);
        if (!current) return;
        if (
          JSON.stringify(current) !==
          JSON.stringify(submissionReceiptSchema.parse(receipt))
        )
          throw new ReceiptError();
        await storage.removeItem(key(receipt.scope, receipt.userId));
        if (await read(receipt.scope, receipt.userId)) throw new ReceiptError();
      }),
  };
}
export type SubmissionJournal = ReturnType<typeof createSubmissionJournal>;
