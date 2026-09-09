import { describe, expect, it, vi } from "vitest";
import { createDraftStore, type DraftMedia } from "./draft-store";
import type { DraftInput } from "./draft-schema";
import { serviceIds } from "./service-ids";
const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const namespace = "furnio.drafts-v2." + "a".repeat(64);
const key = (id = user, service = "virtual_staging") =>
  namespace + "." + id + "." + service;
const input = (): DraftInput => ({
  projectId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  files: [
    {
      uri: "file:///cache/original.jpg",
      name: "photo.jpg",
      contentType: "image/jpeg",
      bytes: 1000,
      width: 1200,
      height: 800,
    },
  ],
  furniture: [],
  pins: [],
  anchor: 0,
  roomType: "living_room",
  style: "contemporary",
  mood: "warm",
  direction: "Preserve the windows",
  preset: "natural_dusk",
  options: [],
  maskRegions: [],
});
function fixture() {
  const values = new Map<string, string>(),
    files = new Set<string>();
  let sequence = 0,
    now = 200_000_000;
  const prefix = (u: string, s: string) => "cache/" + u + "/" + s + "/";
  const storage = {
    getItem: vi.fn(async (k: string) => values.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      values.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      values.delete(k);
    }),
  };
  const media: DraftMedia = {
    copy: vi.fn(async (u, s, g, photos) =>
      photos.map((p, i) => {
        const uri = prefix(u, s) + g + "/" + i + ".jpg";
        files.add(uri);
        return { ...p, uri };
      }),
    ),
    exists: (u, s, g, uri) =>
      uri.startsWith(prefix(u, s) + g + "/") && files.has(uri),
    clear: vi.fn(async (u, s, keep) => {
      for (const file of files)
        if (
          file.startsWith(prefix(u, s)) &&
          (!keep || !file.startsWith(prefix(u, s) + keep + "/"))
        )
          files.delete(file);
    }),
  };
  const legacy = new Map<string, string>();
  const deps = {
    namespace,
    storage,
    media,
    now: () => now,
    uuid: () =>
      "dddddddd-dddd-4ddd-8ddd-" + String(++sequence).padStart(12, "0"),
    clearLegacyPreferences: vi.fn(async (u: string) => {
      legacy.delete(u);
    }),
    clearLegacyDraft: vi.fn(async () => {}),
  };
  return {
    ...deps,
    values,
    files,
    legacy,
    next: () => createDraftStore(deps),
    time: (value: number) => {
      now = value;
    },
  };
}
describe("owned private photo drafts", () => {
  it("requires a completed owner transition before loading or saving", async () => {
    const f = fixture(),
      s = f.next();
    await expect(s.save(user, "virtual_staging", input())).rejects.toThrow(
      "account changed",
    );
    expect(f.values.size).toBe(0);
    await s.setOwner(user);
    const saved = await s.save(user, "virtual_staging", input());
    expect(saved.version).toBe(2);
    expect(saved.files[0]!.uri).not.toBe(input().files[0]!.uri);
    expect(await s.load(user, "virtual_staging")).toEqual(saved);
  });
  it("preserves all editing controls and ordering through replacement", async () => {
    const f = fixture(),
      s = f.next();
    await s.setOwner(user);
    const data = {
      ...input(),
      files: [...input().files, ...input().files],
      furniture: input().files,
      anchor: 1,
      pins: [{ x: 0.3, y: 0.8 }],
      maskRegions: [
        {
          operation: "restyle" as const,
          instruction: "light chair",
          strokes: [{ size: 12, points: [{ x: 0.1, y: 0.2 }] }],
        },
      ],
    };
    const a = await s.save(user, "multiview", data),
      b = await s.save(user, "multiview", { ...data, direction: "Updated" });
    expect(await s.load(user, "multiview")).toEqual(b);
    expect(f.files.has(a.files[0]!.uri)).toBe(false);
    expect(f.files.size).toBe(3);
  });
  it("deletes every service of the previous account and preserves receipts", async () => {
    const f = fixture(),
      s = f.next();
    await s.setOwner(user);
    for (const id of serviceIds) await s.save(user, id, input());
    for (const k of [
      "furnio.purchase-receipt",
      "furnio.deletion-receipt",
      "furnio.batch-receipt",
    ])
      f.values.set(k, "retain");
    f.legacy.set(user, "room preference");
    await s.setOwner(other);
    expect(f.files.size).toBe(0);
    expect(f.legacy.has(user)).toBe(false);
    expect([...f.values.keys()].filter((k) => k.includes(user))).toEqual([]);
    expect(f.values.get("furnio.purchase-receipt")).toBe("retain");
    expect(f.values.get("furnio.deletion-receipt")).toBe("retain");
    expect(f.values.get("furnio.batch-receipt")).toBe("retain");
    await expect(s.load(user, "virtual_staging")).rejects.toThrow(
      "account changed",
    );
    expect(await s.load(other, "virtual_staging")).toBeNull();
  });
  it("retains a valid draft across a same-account cold start, but cleans signed-out startup", async () => {
    const f = fixture(),
      a = f.next();
    await a.setOwner(user);
    const saved = await a.save(user, "virtual_staging", input());
    const b = f.next();
    await b.setOwner(user);
    expect(await b.load(user, "virtual_staging")).toEqual(saved);
    const c = f.next();
    await c.setOwner(null);
    expect(f.values.size).toBe(0);
    expect(f.files.size).toBe(0);
  });
  it("does not wipe an active same-account draft on repeated sign-in events", async () => {
    const f = fixture(),
      s = f.next();
    await s.setOwner(user);
    const saved = await s.save(user, "twilight", input());
    await s.setOwner(user);
    expect(await s.load(user, "twilight")).toEqual(saved);
  });
  it.each(["age", "future", "json", "account", "service", "file"])(
    "removes expired or invalid records and only their owned cache: %s",
    async (kind) => {
      const f = fixture(),
        s = f.next();
      await s.setOwner(user);
      const saved = await s.save(user, "virtual_staging", input());
      await s.save(user, "twilight", input());
      if (kind === "age") f.time(400_000_000);
      if (kind === "future") f.time(1);
      if (kind === "json") f.values.set(key(), "{");
      if (kind === "account")
        f.values.set(key(), JSON.stringify({ ...saved, userId: other }));
      if (kind === "service")
        f.values.set(
          key(),
          JSON.stringify({ ...saved, service: "floor_plan" }),
        );
      if (kind === "file") f.files.delete(saved.files[0]!.uri);
      expect(await s.load(user, "virtual_staging")).toBeNull();
      expect(f.values.has(key())).toBe(false);
      expect(f.values.has(key(user, "twilight"))).toBe(true);
    },
  );
  it("sweeps expired drafts on reopening the app", async () => {
    const f = fixture(),
      s = f.next();
    await s.setOwner(user);
    await s.save(user, "twilight", input());
    f.time(400_000_000);
    await f.next().setOwner(user);
    expect(f.files.size).toBe(0);
    expect(f.values.has(key(user, "twilight"))).toBe(false);
  });
  it("discards one service, leaving the active other service intact", async () => {
    const f = fixture(),
      s = f.next();
    await s.setOwner(user);
    await s.save(user, "virtual_staging", input());
    const otherDraft = await s.save(user, "twilight", input());
    await s.discard(user, "virtual_staging");
    expect(await s.load(user, "twilight")).toEqual(otherDraft);
  });
  it("retains cleanup ownership on an interrupted sign-out and retries on restart", async () => {
    const f = fixture(),
      s = f.next();
    await s.setOwner(user);
    await s.save(user, "virtual_staging", input());
    vi.mocked(f.media.clear).mockRejectedValueOnce(new Error("device locked"));
    await expect(s.setOwner(null)).rejects.toThrow("device locked");
    await expect(s.save(user, "twilight", input())).rejects.toThrow(
      "account changed",
    );
    expect(f.values.get(namespace + ".owner")).toContain(user);
    await f.next().setOwner(null);
    expect(f.files.size).toBe(0);
    expect(f.values.size).toBe(0);
  });
  it("blocks an old save that finishes after switching accounts", async () => {
    const f = fixture(),
      s = f.next();
    await s.setOwner(user);
    const copy = f.media.copy;
    let finish: (() => void) | undefined, entered: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.media.copy = async (...args) => {
      const value = await copy(...args);
      entered!();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return value;
    };
    const save = s.save(user, "virtual_staging", input());
    const rejected = expect(save).rejects.toThrow("account changed");
    await started;
    const change = s.setOwner(other);
    finish!();
    await rejected;
    await change;
    expect(f.files.size).toBe(0);
    expect(f.values.has(key())).toBe(false);
  });
  it("cleans a committed save when sign-out races secure storage completion", async () => {
    const f = fixture(),
      s = f.next();
    await s.setOwner(user);
    let finish: (() => void) | undefined, entered: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.storage.setItem.mockImplementation(async (k, v) => {
      f.values.set(k, v);
      if (k === key()) {
        entered!();
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      }
    });
    const save = s.save(user, "virtual_staging", input());
    const rejected = expect(save).rejects.toThrow("account changed");
    await started;
    const cleanup = s.setOwner(null);
    finish!();
    await rejected;
    await cleanup;
    expect(f.files.size).toBe(0);
    expect(f.values.size).toBe(0);
  });
  it("does not follow corrupt ownership or a foreign generation", async () => {
    const f = fixture();
    f.values.set(namespace + ".owner", "{");
    await expect(f.next().setOwner(user)).rejects.toThrow("cleanup");
    expect(f.media.clear).not.toHaveBeenCalled();
    f.values.clear();
    const s = f.next();
    await s.setOwner(user);
    const a = await s.save(user, "virtual_staging", input());
    const b = await s.save(user, "twilight", input());
    f.values.set(key(), JSON.stringify({ ...a, files: b.files }));
    expect(await s.load(user, "virtual_staging")).toBeNull();
    expect(f.files.has(b.files[0]!.uri)).toBe(true);
  });
  it("cleans interrupted-save orphan copies without a metadata record", async () => {
    const f = fixture(),
      s = f.next();
    await s.setOwner(user);
    f.storage.setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(s.save(user, "virtual_staging", input())).rejects.toThrow(
      "disk full",
    );
    expect(f.files.size).toBe(1);
    expect(await s.load(user, "virtual_staging")).toBeNull();
    expect(f.files.size).toBe(0);
  });
  it("does not accept unknown service IDs or oversized input", async () => {
    const f = fixture(),
      s = f.next();
    await s.setOwner(user);
    await expect(s.save(user, "../bad" as never, input())).rejects.toThrow();
    await expect(
      s.save(user, "virtual_staging", {
        ...input(),
        direction: "x".repeat(601),
      }),
    ).rejects.toThrow();
    expect(f.media.copy).not.toHaveBeenCalled();
  });
});
