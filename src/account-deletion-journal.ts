import { z } from "zod";
import {
  deletionCapabilitySchema,
  deletionConfirmationSchema,
  deletionPreparationSchema,
  deletionReceiptSchema,
  type DeletionCapability,
  type DeletionReceipt,
} from "./account-deletion-contract";

const recordSchema = z
  .object({
    version: z.literal(1),
    userId: z.uuid(),
    capability: deletionCapabilitySchema,
    phase: z.enum([
      "preparing",
      "prepared",
      "confirming",
      "queued",
      "cancelled",
      "expired",
    ]),
    receipt: deletionReceiptSchema.nullable(),
  })
  .strict()
  .superRefine((record, context) => {
    const expected = record.phase === "confirming" ? "prepared" : record.phase;
    if (
      record.phase === "preparing"
        ? record.receipt !== null
        : record.receipt?.state !== expected
    )
      context.addIssue({
        code: "custom",
        message: "Account receipt phase is inconsistent.",
      });
  });
export type DeletionJournalRecord = z.infer<typeof recordSchema>;
type Dependencies = {
  // Supply device-only SecureStore, never AsyncStorage or a cloud-synced store.
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  };
  namespace: string;
  uuid(): string;
  secret(): Promise<string>;
  now(): number;
  // The real adapter must freeze and verify the SAME account's bearer token for
  // prepare/confirm/cancel. Status uses only the scoped receipt capability.
  send(
    action: "prepare" | "confirm" | "cancel" | "status",
    input: unknown,
    userId: string,
  ): Promise<unknown>;
};

// Native-process coordination: reopening a screen while its previous network
// operation is finishing must not replace the durable capability. This module
// is client-only; no Worker request state is kept in this map.
const pendingJournals = new Map<string, Promise<unknown>>();
export function createDeletionJournal(deps: Dependencies) {
  if (!/^[a-z0-9_-]{3,80}$/.test(deps.namespace))
    throw new Error("Invalid deletion storage environment.");
  function serial<T>(task: () => Promise<T>) {
    const queue = pendingJournals.get(deps.namespace) ?? Promise.resolve();
    const pending = queue.catch(() => undefined).then(task);
    const settled = pending
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        if (pendingJournals.get(deps.namespace) === settled)
          pendingJournals.delete(deps.namespace);
      });
    pendingJournals.set(deps.namespace, settled);
    return pending;
  }
  function key(userId: string) {
    if (!z.uuid().safeParse(userId).success)
      throw new Error("Sign in to the correct account first.");
    return `furnio-deletion-${deps.namespace}-${userId}`;
  }
  async function read(userId: string) {
    const raw = await deps.storage.getItem(key(userId));
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        "Account request receipt needs recovery. It has not been replaced.",
      );
    }
    const result = recordSchema.safeParse(parsed);
    if (
      !result.success ||
      result.data.userId !== userId ||
      (result.data.receipt &&
        result.data.receipt.requestId !== result.data.capability.requestId)
    )
      throw new Error(
        "Account request receipt needs recovery. It has not been replaced.",
      );
    return result.data;
  }
  async function save(record: DeletionJournalRecord) {
    // A failed secure write must prevent the next network mutation.
    await deps.storage.setItem(
      key(record.userId),
      JSON.stringify(recordSchema.parse(record)),
    );
    return record;
  }
  function receipt(
    value: unknown,
    capability: DeletionCapability,
  ): DeletionReceipt {
    const parsed = deletionReceiptSchema.safeParse(value);
    if (!parsed.success || parsed.data.requestId !== capability.requestId)
      throw new Error(
        "Account request status is incompatible. Keep this receipt and refresh status.",
      );
    return parsed.data;
  }
  async function refresh(record: DeletionJournalRecord) {
    const result = receipt(
      await deps.send("status", record.capability, record.userId),
      record.capability,
    );
    // A prepared status after an uncertain confirmation does NOT prove that a
    // concurrent server operation cannot still accept it. Never auto-resubmit.
    const phase =
      record.phase === "confirming" && result.state === "prepared"
        ? "confirming"
        : result.state;
    return save({ ...record, phase, receipt: result });
  }
  return {
    read: (userId: string) => serial(() => read(userId)),
    refresh: (userId: string) =>
      serial(async () => {
        const record = await read(userId);
        return record ? refresh(record) : null;
      }),
    prepare: (userId: string) =>
      serial(async () => {
        let record = await read(userId);
        if (record && ["confirming", "queued"].includes(record.phase)) {
          await refresh(record);
          throw new Error(
            "A deletion confirmation may already be accepted. Check its saved status; do not start another request.",
          );
        }
        if (!record || ["expired", "cancelled"].includes(record.phase)) {
          const capability = deletionCapabilitySchema.safeParse({
            requestId: deps.uuid(),
            receiptSecret: await deps.secret(),
          });
          if (!capability.success)
            throw new Error(
              "A secure account request receipt could not be created.",
            );
          record = await save({
            version: 1,
            userId,
            capability: capability.data,
            phase: "preparing",
            receipt: null,
          });
        }
        const result = deletionPreparationSchema.safeParse(
          await deps.send("prepare", record.capability, userId),
        );
        if (
          !result.success ||
          result.data.requestId !== record.capability.requestId ||
          (result.data.state === "prepared") !==
            (result.data.challenge !== null)
        )
          throw new Error(
            "Account review is incompatible. Your saved receipt has been kept.",
          );
        const {
          challenge: _challenge,
          noticeVersion: _notice,
          canConfirm: _ready,
          review: _review,
          ...status
        } = result.data;
        await save({
          ...record,
          phase: status.state,
          receipt: receipt(status, record.capability),
        });
        // Do not persist personal review counts or the one-time confirmation nonce.
        return result.data;
      }),
    confirm: (
      userId: string,
      review: unknown,
      explicit: {
        confirmation: string;
        acknowledgeSharedAccount: boolean;
        acknowledgeBilling: boolean;
      },
    ) =>
      serial(async () => {
        const record = await read(userId);
        if (!record)
          throw new Error("Review your account before confirming deletion.");
        if (["confirming", "queued"].includes(record.phase))
          return refresh(record);
        const prepared = deletionPreparationSchema.safeParse(review);
        if (
          !prepared.success ||
          !prepared.data.canConfirm ||
          prepared.data.state !== "prepared" ||
          record.phase !== "prepared" ||
          prepared.data.requestId !== record.capability.requestId ||
          Date.parse(prepared.data.expiresAt) <= deps.now()
        )
          throw new Error(
            "Deletion is unavailable or this review has expired. Review the account again.",
          );
        const confirmation = deletionConfirmationSchema.safeParse({
          ...record.capability,
          ...explicit,
          challenge: prepared.data.challenge,
          noticeVersion: prepared.data.noticeVersion,
        });
        if (!confirmation.success)
          throw new Error(
            "Read both warnings and type the exact confirmation before continuing.",
          );
        record.phase = "confirming";
        await save(record);
        // A network failure leaves 'confirming' durable. Resume only reads status;
        // it does not repeat the action, throw away the capability, or log out.
        const result = receipt(
          await deps.send("confirm", confirmation.data, userId),
          record.capability,
        );
        return save({
          ...record,
          phase: result.state === "prepared" ? "confirming" : result.state,
          receipt: result,
        });
      }),
    cancel: (userId: string) =>
      serial(async () => {
        const record = await read(userId);
        if (!record) return null;
        if (["queued", "confirming"].includes(record.phase))
          return refresh(record);
        const result = receipt(
          await deps.send("cancel", record.capability, userId),
          record.capability,
        );
        return save({ ...record, phase: result.state, receipt: result });
      }),
  };
}
