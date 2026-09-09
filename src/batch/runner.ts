import { z } from "zod";
import {
  reserveBatchSchema,
  reserveBatchResponseSchema,
  type ReserveBatchResponse,
} from "../contracts/uploads";
import { stageJobResponseSchema } from "../contracts/jobs";
import { parseServiceRequest } from "../api/service-request";
import { quotedJobEndpoint } from "../api/credit-quote";
import type { LocalPhoto } from "../media";
import type { ServiceId } from "../services";

export const batchServices = {
  virtual_staging: "stage",
  item_removal: "remove",
  custom_staging: "custom",
  twilight: "twilight",
  winter_to_summer: "winter-to-summer",
  exterior_enhancement: "exterior-enhancement",
  floor_plan: "floor-plan",
} as const;
export type BatchService = keyof typeof batchServices;
export function supportsBatch(id: ServiceId): id is BatchService {
  return id in batchServices;
}
export const endpoints: Record<BatchService, string> = {
  virtual_staging: "/api/jobs/stage",
  item_removal: "/api/jobs/mask-edit",
  custom_staging: "/api/jobs/mask-edit",
  twilight: "/api/jobs/enhance",
  winter_to_summer: "/api/jobs/enhance",
  exterior_enhancement: "/api/jobs/enhance",
  floor_plan: "/api/jobs/floorplan",
};
const fixtureId = "00000000-0000-4000-8000-000000000001";
export type BatchEntry = {
  file: LocalPhoto;
  settings: Record<string, unknown>;
};
export type ItemState = {
  position: number;
  status:
    | "reserved"
    | "uploading"
    | "submitting"
    | "queued"
    | "failed"
    | "uncertain"
    | "not_submitted";
  jobId?: string;
  message?: string;
};
export type BatchDependencies = {
  expectedCredits: number;
  api: <T>(
    path: string,
    schema: z.ZodType<T>,
    body: unknown,
    options?: { expectedCredits: number },
  ) => Promise<T>;
  upload: (
    file: LocalPhoto,
    signed: ReserveBatchResponse["items"][number],
  ) => Promise<void>;
  prepareSettings: (
    position: number,
    itemId: string,
  ) => Promise<Record<string, unknown>>;
  ensureCurrent: () => Promise<void>;
  onReservation: (reservation: ReserveBatchResponse) => void;
  onState: (state: ItemState) => void;
  now?: () => number;
};
export function validBatchSettings(
  service: BatchService,
  settings: Record<string, unknown>,
) {
  const parsed = parseServiceRequest(service, {
    ...settings,
    assetId: fixtureId,
  });
  const safe: Record<string, unknown> = { ...parsed };
  delete safe.assetId;
  delete safe.batchItemId;
  return safe;
}
export async function runBatch(
  service: BatchService,
  projectId: string,
  idempotencyKey: string,
  entries: BatchEntry[],
  deps: BatchDependencies,
) {
  const expectedCredits = deps.expectedCredits;
  if (!Number.isSafeInteger(expectedCredits) || expectedCredits <= 0)
    throw new Error("Review the complete batch credit cost first.");
  // Validate every item BEFORE reserving any credit. Unknown prompt/admin fields
  // are stripped by the same frozen job schemas used for individual edits.
  const settings = entries.map((entry) =>
    validBatchSettings(service, entry.settings),
  );
  const body = reserveBatchSchema.parse({
    featureSlug: batchServices[service],
    projectId,
    idempotencyKey,
    files: entries.map((entry, index) => ({
      fileName: entry.file.name,
      contentType: entry.file.contentType,
      contentLength: entry.file.bytes,
      settings: settings[index],
    })),
  });
  await deps.ensureCurrent();
  const reservation = await deps.api(
    "/api/mobile/v1/batches/reserve",
    reserveBatchResponseSchema,
    body,
    { expectedCredits },
  );
  deps.onReservation(reservation);
  // Reject incompatible/reordered/duplicated allocations; never attach one
  // photo to another file's reservation. No second reservation is attempted.
  if (
    reservation.creditsReserved !== expectedCredits ||
    !Number.isInteger(reservation.creditsReserved / entries.length) ||
    reservation.items.length !== entries.length ||
    new Set(reservation.items.map((i) => i.itemId)).size !== entries.length ||
    new Set(reservation.items.map((i) => i.assetId)).size !== entries.length ||
    !Number.isFinite(Date.parse(reservation.reservationExpiresAt)) ||
    reservation.items.some(
      (item, index) =>
        !Number.isFinite(Date.parse(item.expiresAt)) ||
        item.position !== index ||
        item.contentLength !== entries[index]!.file.bytes ||
        item.fileName !== entries[index]!.file.name,
    )
  )
    throw new Error(
      "The batch allocation did not match your photos. Do not reserve again; contact support with the batch reference.",
    );
  const results: ItemState[] = entries.map((_, position) => ({
    position,
    status: "reserved",
  }));
  results.forEach(deps.onState);
  let stopped = false;
  for (const [position, item] of reservation.items.entries()) {
    const update = (state: Omit<ItemState, "position">) => {
      results[position] = { position, ...state };
      deps.onState(results[position]!);
    };
    if (stopped) {
      update({
        status: "not_submitted",
        message:
          "Not submitted. Unclaimed credits are returned by the server after this reservation expires.",
      });
      continue;
    }
    try {
      if (
        (deps.now?.() ?? Date.now()) >=
        Math.min(
          Date.parse(reservation.reservationExpiresAt),
          Date.parse(item.expiresAt),
        )
      )
        throw new Error(
          "This upload reservation expired. Unclaimed credits are returned by the server.",
        );
      await deps.ensureCurrent();
      update({ status: "uploading" });
      await deps.upload(entries[position]!.file, item);
      await deps.ensureCurrent();
      const prepared = await deps.prepareSettings(position, item.itemId);
      const input = parseServiceRequest(service, {
        ...settings[position],
        ...prepared,
        assetId: item.assetId,
        batchItemId: item.itemId,
      });
      await deps.ensureCurrent();
      update({ status: "submitting" });
      const job = await deps.api(
        quotedJobEndpoint(endpoints[service]),
        stageJobResponseSchema,
        input,
        { expectedCredits: reservation.creditsReserved / entries.length },
      );
      update({ status: "queued", jobId: job.jobId });
    } catch (error) {
      const uncertain = !!(
        error &&
        typeof error === "object" &&
        "uncertain" in error &&
        error.uncertain
      );
      const message =
        error instanceof Error
          ? error.message
          : "This item could not be submitted.";
      update({ status: uncertain ? "uncertain" : "failed", message });
      // Stop after any failure: keep successful job IDs, don't duplicate work,
      // and leave untouched reservations to the existing server expiry/refund.
      stopped = true;
    }
  }
  return { reservation, items: results };
}
