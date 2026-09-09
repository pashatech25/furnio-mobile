import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  runBatch,
  validBatchSettings,
  supportsBatch,
  type BatchDependencies,
  type BatchEntry,
  type ItemState,
} from "./runner";
import { ApiError } from "../api/client";
const project = "00000000-0000-4000-8000-000000000001",
  now = Date.now(),
  key = "native-batch-key-fixture";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const entries: BatchEntry[] = [0, 1, 2].map((n) => ({
  file: {
    uri: `file:///fixture/${n}.jpg`,
    name: `${n}.jpg`,
    bytes: 123,
    contentType: "image/jpeg",
    width: 100,
    height: 100,
  },
  settings: {
    roomType: "Living room",
    style: "Modern",
    masterPrompt: "NEVER SEND THIS",
  },
}));
function setup() {
  const reservation = {
    batchId: id(10),
    creditsReserved: 15,
    projectPhotoCountBefore: 0,
    projectPhotoLimit: 50,
    reservationExpiresAt: new Date(now + 900000).toISOString(),
    items: entries.map((entry, index) => ({
      assetId: id(20 + index),
      itemId: id(30 + index),
      position: index,
      fileName: entry.file.name,
      contentLength: entry.file.bytes,
      uploadUrl: "https://storage.invalid/photo",
      headers: { "Content-Type": "image/jpeg" },
      expiresAt: new Date(now + 900000).toISOString(),
    })),
  };
  const states: ItemState[] = [];
  const api = vi.fn(
    async <T>(
      path: string,
      schema: z.ZodType<T>,
      _body: unknown,
      _options?: { expectedCredits: number },
    ) =>
      schema.parse(
        path === "/api/mobile/v1/batches/reserve"
          ? reservation
          : {
              jobId: id(40 + states.length),
              creditsReserved: 5,
              status: "queued",
            },
      ),
  );
  const deps: BatchDependencies = {
    expectedCredits: 15,
    api,
    upload: vi.fn(async () => undefined),
    prepareSettings: vi.fn(async () => ({})),
    ensureCurrent: vi.fn(async () => undefined),
    onReservation: vi.fn(),
    onState: (s) => states.push(s),
    now: () => now,
  };
  return { deps, api, reservation, states };
}
describe("native batch safety", () => {
  it("sends the confirmed total once and the reserved per-photo price on each submission", async () => {
    const { deps, api, reservation } = setup();
    deps.expectedCredits = 21;
    reservation.creditsReserved = 21;
    await runBatch("virtual_staging", project, key, entries, deps);
    expect(api.mock.calls[0]?.[3]).toEqual({ expectedCredits: 21 });
    expect(api.mock.calls.slice(1).map((call) => call[3])).toEqual([
      { expectedCredits: 7 },
      { expectedCredits: 7 },
      { expectedCredits: 7 },
    ]);
  });
  it("records an unexpected reserved price for recovery but never uploads or resubmits", async () => {
    const { deps, api, reservation } = setup();
    reservation.creditsReserved = 18;
    await expect(
      runBatch("virtual_staging", project, key, entries, deps),
    ).rejects.toThrow("Do not reserve again");
    expect(deps.onReservation).toHaveBeenCalledWith(reservation);
    expect(deps.upload).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("requires a usable total before any reservation", async () => {
    const { deps, api } = setup();
    deps.expectedCredits = 0;
    await expect(
      runBatch("virtual_staging", project, key, entries, deps),
    ).rejects.toThrow("credit cost");
    expect(api).not.toHaveBeenCalled();
  });
  it("keeps multi-view and reference furniture on their dedicated workflows", () => {
    expect(supportsBatch("multiview")).toBe(false);
    expect(supportsBatch("reference_furniture")).toBe(false);
    expect(supportsBatch("item_removal")).toBe(true);
  });
  it("reserves the whole batch once, then claims each exact allocation with normal customer job requests", async () => {
    const { deps, api, reservation } = setup();
    const result = await runBatch(
      "virtual_staging",
      project,
      key,
      entries,
      deps,
    );
    expect(
      api.mock.calls.filter(
        ([path]) => path === "/api/mobile/v1/batches/reserve",
      ),
    ).toHaveLength(1);
    expect(deps.upload).toHaveBeenCalledTimes(3);
    expect(result.items.map((i) => i.status)).toEqual([
      "queued",
      "queued",
      "queued",
    ]);
    expect(api.mock.calls[1]?.[2]).toMatchObject({
      assetId: reservation.items[0]!.assetId,
      batchItemId: reservation.items[0]!.itemId,
    });
    expect(JSON.stringify(api.mock.calls)).not.toContain("NEVER SEND THIS");
  });
  it("validates all settings before any reservation or upload", async () => {
    const { deps, api } = setup();
    await expect(
      runBatch(
        "virtual_staging",
        project,
        key,
        [entries[0]!, { ...entries[1]!, settings: { roomType: "" } }],
        deps,
      ),
    ).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
  });
  it("rejects PDF images outside the floor-plan workflow", async () => {
    const { deps, api } = setup();
    await expect(
      runBatch(
        "virtual_staging",
        project,
        key,
        [
          {
            ...entries[0]!,
            file: { ...entries[0]!.file, contentType: "application/pdf" },
          },
        ],
        deps,
      ),
    ).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });
  it("does not repeat an uncertain reservation", async () => {
    const { deps, api } = setup();
    api.mockRejectedValue(new ApiError("unknown", 0, true));
    await expect(
      runBatch("virtual_staging", project, key, entries, deps),
    ).rejects.toMatchObject({ uncertain: true });
    expect(api).toHaveBeenCalledTimes(1);
    expect(deps.upload).not.toHaveBeenCalled();
  });
  it.each(["position", "assetId", "contentLength", "expiresAt"] as const)(
    "rejects incompatible allocation field %s",
    async (field) => {
      const { deps, reservation } = setup();
      if (field === "position") reservation.items[0]!.position = 2;
      if (field === "assetId")
        reservation.items[0]!.assetId = reservation.items[1]!.assetId;
      if (field === "contentLength") reservation.items[0]!.contentLength = 124;
      if (field === "expiresAt") reservation.items[0]!.expiresAt = "not-a-date";
      await expect(
        runBatch("virtual_staging", project, key, entries, deps),
      ).rejects.toThrow("allocation");
      expect(deps.upload).not.toHaveBeenCalled();
    },
  );
  it("stops after an uncertain paid submission and retains already-accepted job references", async () => {
    const { deps, api } = setup(),
      original = deps.api;
    let jobCalls = 0;
    deps.api = async (path, schema, body) => {
      if (path === "/api/mobile/v1/jobs/stage" && ++jobCalls === 2)
        throw new ApiError("check project", 0, true);
      return original(path, schema, body);
    };
    const result = await runBatch(
      "virtual_staging",
      project,
      key,
      entries,
      deps,
    );
    expect(result.items.map((i) => i.status)).toEqual([
      "queued",
      "uncertain",
      "not_submitted",
    ]);
    expect(result.items[0]?.jobId).toBeTruthy();
    expect(deps.upload).toHaveBeenCalledTimes(2);
    expect(
      api.mock.calls.filter(
        ([path]) => path === "/api/mobile/v1/batches/reserve",
      ),
    ).toHaveLength(1);
  });
  it("does not upload expired reservations or bypass account changes", async () => {
    const { deps } = setup();
    deps.now = () => now + 900001;
    const result = await runBatch(
      "virtual_staging",
      project,
      key,
      entries,
      deps,
    );
    expect(result.items.map((i) => i.status)).toEqual([
      "failed",
      "not_submitted",
      "not_submitted",
    ]);
    expect(deps.upload).not.toHaveBeenCalled();
  });
  it("stops if the account changes after reservation", async () => {
    const { deps } = setup();
    vi.mocked(deps.ensureCurrent)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("account changed"));
    const result = await runBatch(
      "virtual_staging",
      project,
      key,
      entries,
      deps,
    );
    expect(result.items[0]?.status).toBe("failed");
    expect(deps.upload).not.toHaveBeenCalled();
  });
  it("preserves every service-specific preset without allowing unrelated master prompts", () => {
    expect(
      validBatchSettings("twilight", {
        feature: "twilight",
        preset: "blue_hour",
        masterPrompt: "x",
      }),
    ).toEqual({ feature: "twilight", preset: "blue_hour" });
    expect(
      validBatchSettings("winter_to_summer", { feature: "winter_to_summer" }),
    ).toEqual({ feature: "winter_to_summer" });
    expect(validBatchSettings("floor_plan", {})).toEqual({});
    expect(() =>
      validBatchSettings("exterior_enhancement", {
        feature: "exterior_enhancement",
        options: [],
      }),
    ).toThrow();
  });
});
