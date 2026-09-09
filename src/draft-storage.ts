import { z } from "zod";

const partsSchema = z
  .object({ id: z.uuid(), count: z.number().int().min(1).max(100) })
  .strict();
const recordSchema = z
  .object({
    version: z.literal(1),
    active: partsSchema.nullable(),
    pending: z.array(partsSchema).max(2),
  })
  .strict();
type Record = z.infer<typeof recordSchema>;
// Draft-only crash journal. Never use this namespace for credentials or payment receipts.
export function createDraftStorage(deps: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  uuid(): string;
}) {
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (
      !/^furnio\.drafts-v2\.[a-f0-9]{64}\.(owner|[a-f0-9-]{36}\.[a-z_]+)$/.test(
        key,
      )
    )
      return Promise.reject(new Error("Invalid draft storage key."));
    const result = (queues.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(work);
    queues.set(key, result);
    void result
      .finally(() => {
        if (queues.get(key) === result) queues.delete(key);
      })
      .catch(() => undefined);
    return result;
  }
  const manifest = (key: string) => `${key}.index`;
  const piece = (key: string, id: string, index: number) =>
    `${key}.body.${id}.${index}`;
  async function read(key: string): Promise<Record> {
    const raw = await deps.get(manifest(key));
    if (raw === null) return { version: 1, active: null, pending: [] };
    try {
      const record = recordSchema.parse(JSON.parse(raw));
      if (
        record.pending.some((p) => p.id === record.active?.id) ||
        new Set(record.pending.map((p) => p.id)).size !== record.pending.length
      )
        throw new Error();
      return record;
    } catch {
      throw new Error(
        "Private draft storage needs cleanup. Its ownership index is invalid.",
      );
    }
  }
  async function clean(key: string, record: Record) {
    for (const part of record.pending) {
      for (let index = 0; index < part.count; index++)
        await deps.remove(piece(key, part.id, index));
    }
    if (record.pending.length) {
      record = { ...record, pending: [] };
      await deps.set(manifest(key), JSON.stringify(record));
    }
    return record;
  }
  function chunks(value: string) {
    const encoder = new TextEncoder();
    const result: string[] = [];
    let chunk = "",
      bytes = 0;
    for (const char of value) {
      const size = encoder.encode(char).byteLength;
      if (bytes + size > 1800) {
        result.push(chunk);
        chunk = "";
        bytes = 0;
      }
      chunk += char;
      bytes += size;
    }
    result.push(chunk);
    if (result.length > 100)
      throw new Error("Draft storage capacity exceeded.");
    return result;
  }
  return {
    getItem: (key: string) =>
      serial(key, async () => {
        const record = await clean(key, await read(key));
        if (!record.active) return null;
        let value = "";
        for (let index = 0; index < record.active.count; index++) {
          const chunk = await deps.get(piece(key, record.active.id, index));
          if (chunk === null)
            throw new Error(
              "Private draft data is incomplete. Retry device cleanup.",
            );
          value += chunk;
        }
        return value;
      }),
    setItem: (key: string, value: string) =>
      serial(key, async () => {
        const parts = chunks(value);
        const previous = await clean(key, await read(key));
        const next = partsSchema.parse({
          id: deps.uuid(),
          count: parts.length,
        });
        // Every new piece is indexed before it exists. Interruption retains the old active value.
        await deps.set(
          manifest(key),
          JSON.stringify({ ...previous, pending: [next] }),
        );
        for (const [index, chunk] of parts.entries())
          await deps.set(piece(key, next.id, index), chunk);
        const committed: Record = {
          version: 1,
          active: next,
          pending: previous.active ? [previous.active] : [],
        };
        await deps.set(manifest(key), JSON.stringify(committed));
        // A failed cleanup remains fully indexed for the next read/removal.
        await clean(key, committed);
      }),
    removeItem: (key: string) =>
      serial(key, async () => {
        const record = await clean(key, await read(key));
        if (!record.active) {
          await deps.remove(manifest(key));
          return;
        }
        const deleting: Record = {
          version: 1,
          active: null,
          pending: record.active ? [record.active] : [],
        };
        await deps.set(manifest(key), JSON.stringify(deleting));
        await clean(key, deleting);
        await deps.remove(manifest(key));
      }),
  };
}
