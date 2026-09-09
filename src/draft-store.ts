import { z } from "zod";
import { draftSchema, type Draft, type DraftInput } from "./draft-schema";
import { serviceIds, type ServiceId } from "./service-ids";

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export type DraftMedia = {
  copy(
    user: string,
    service: ServiceId,
    generation: string,
    photos: Draft["files"],
  ): Promise<Draft["files"]>;
  exists(
    user: string,
    service: ServiceId,
    generation: string,
    uri: string,
  ): boolean;
  clear(
    user: string,
    service: ServiceId,
    keepGeneration?: string,
  ): Promise<void>;
};
const ownerSchema = z
  .object({ version: z.literal(1), userId: z.uuid() })
  .strict();
const unavailable = () =>
  new Error(
    "Your account changed or device draft cleanup is pending. Reopen the editor after signing in.",
  );
export function createDraftStore(deps: {
  namespace: string;
  storage: Storage;
  media: DraftMedia;
  clearLegacyPreferences(user: string): Promise<void>;
  clearLegacyDraft(user: string, service: ServiceId): Promise<void>;
  uuid(): string;
  now(): number;
}) {
  if (!/^furnio\.drafts-v2\.[a-f0-9]{64}$/.test(deps.namespace))
    throw new Error("Invalid draft namespace.");
  const ownerKey = `${deps.namespace}.owner`;
  const key = (user: string, service: ServiceId) =>
    `${deps.namespace}.${z.uuid().parse(user)}.${z.enum(serviceIds).parse(service)}`;
  let active: string | null = null,
    epoch = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.catch(() => undefined).then(work);
    queue = result;
    return result;
  };
  const guard = (user: string, expected: number) => {
    if (active !== user || expected !== epoch) throw unavailable();
  };
  async function clear(user: string, service: ServiceId) {
    // Only generated cache scopes can be deleted. Metadata never supplies a deletion path.
    await deps.media.clear(user, service);
    await deps.storage.removeItem(key(user, service));
    await deps.clearLegacyDraft(user, service);
  }
  async function clearUser(user: string) {
    for (const service of serviceIds) await clear(user, service);
    await deps.clearLegacyPreferences(user);
  }
  async function read(user: string, service: ServiceId): Promise<Draft | null> {
    const raw = await deps.storage.getItem(key(user, service));
    if (!raw) {
      await clear(user, service);
      return null;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
    const parsed = draftSchema.safeParse(value);
    if (
      !parsed.success ||
      parsed.data.userId !== user ||
      parsed.data.service !== service ||
      parsed.data.savedAt > deps.now() + 60_000 ||
      parsed.data.savedAt < deps.now() - 48 * 60 * 60 * 1000 ||
      [...parsed.data.files, ...parsed.data.furniture].some(
        (photo) =>
          !deps.media.exists(user, service, parsed.data.generation, photo.uri),
      )
    ) {
      await clear(user, service);
      return null;
    }
    await deps.media.clear(user, service, parsed.data.generation);
    return parsed.data;
  }
  return {
    setOwner(user: string | null): Promise<void> {
      if (user !== null) z.uuid().parse(user);
      if (user !== null && active === user) return Promise.resolve();
      active = null;
      const expected = ++epoch;
      return serial(async () => {
        const raw = await deps.storage.getItem(ownerKey);
        let previous: string | null = null;
        if (raw) {
          try {
            previous = ownerSchema.parse(JSON.parse(raw)).userId;
          } catch {
            throw unavailable();
          }
        }
        if (previous && previous !== user) await clearUser(previous);
        if (user) {
          // Persist ownership before accepting writes; retain it until cleanup succeeds.
          await deps.storage.setItem(
            ownerKey,
            JSON.stringify({ version: 1, userId: user }),
          );
          for (const service of serviceIds) {
            await deps.clearLegacyDraft(user, service);
            await read(user, service);
          }
          await deps.clearLegacyPreferences(user);
        } else await deps.storage.removeItem(ownerKey);
        if (expected !== epoch) throw unavailable();
        active = user;
      });
    },
    save(user: string, service: ServiceId, input: DraftInput): Promise<Draft> {
      const expected = epoch;
      return serial(async () => {
        guard(user, expected);
        const generation = z.uuid().parse(deps.uuid());
        const draft = draftSchema.parse({
          ...input,
          version: 2,
          generation,
          userId: user,
          service,
          savedAt: deps.now(),
        });
        if (
          new TextEncoder().encode(JSON.stringify(draft)).byteLength > 140_000
        )
          throw new Error(
            "This painted draft is too detailed for secure draft storage. Finish the edit before closing it.",
          );
        const copies = await deps.media.copy(user, service, generation, [
          ...draft.files,
          ...draft.furniture,
        ]);
        guard(user, expected);
        if (
          copies.length !== draft.files.length + draft.furniture.length ||
          copies.some(
            (photo) => !deps.media.exists(user, service, generation, photo.uri),
          )
        )
          throw new Error("Draft photo copying was incomplete.");
        const saved = draftSchema.parse({
          ...draft,
          files: copies.slice(0, draft.files.length),
          furniture: copies.slice(draft.files.length),
        });
        const json = JSON.stringify(saved);
        if (new TextEncoder().encode(json).byteLength > 140_000)
          throw new Error("This draft exceeds secure storage capacity.");
        await deps.storage.setItem(key(user, service), json);
        guard(user, expected);
        await deps.media.clear(user, service, generation);
        guard(user, expected);
        return saved;
      });
    },
    load(user: string, service: ServiceId): Promise<Draft | null> {
      const expected = epoch;
      return serial(async () => {
        guard(user, expected);
        const draft = await read(user, service);
        guard(user, expected);
        return draft;
      });
    },
    discard(user: string, service: ServiceId): Promise<void> {
      const expected = epoch;
      return serial(async () => {
        guard(user, expected);
        await clear(user, service);
      });
    },
  };
}
