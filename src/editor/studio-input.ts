import { z } from "zod";
import { parseServiceRequest } from "../api/service-request";
import { MAX_UPLOAD_BYTES } from "../contracts/uploads";
import type {
  ExteriorEnhancementOption,
  TwilightPreset,
} from "../contracts/jobs";
import type { LocalPhoto } from "../media";
import type { ServiceId } from "../service-ids";
import type { MaskExport, PaintRegion } from "./mask-export";
import type { Point } from "./geometry";

export type StudioInput = {
  projectId: string;
  files: LocalPhoto[];
  furniture: LocalPhoto[];
  pins: (Point | null | undefined)[];
  anchor: number;
  roomType: string;
  style: string;
  mood: string;
  direction: string;
  preset: TwilightPreset;
  options: ExteriorEnhancementOption[];
};
export type UploadedMask = Pick<
  MaskExport,
  "bbox" | "operation" | "instruction" | "regionIndex"
> & { maskKey: string; compositeMaskKey: string };
export class StudioInputError extends Error {}

function validFile(file: LocalPhoto, allowPdf: boolean) {
  if (
    !file.uri ||
    !Number.isSafeInteger(file.bytes) ||
    file.bytes <= 0 ||
    file.bytes > MAX_UPLOAD_BYTES
  )
    throw new StudioInputError("Choose a non-empty file of 20 MB or less.");
  if (!file.name.trim() || file.name.trim().length > 255)
    throw new StudioInputError("Use a file name of 1–255 characters.");
  if (file.contentType === "application/pdf" && allowPdf) return;
  if (file.contentType !== "image/jpeg")
    throw new StudioInputError(
      "Choose a JPEG photo. Only floor plans accept a PDF.",
    );
  if (![file.width, file.height].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new StudioInputError(
      "The photo dimensions could not be read. Choose the photo again.",
    );
}

function parse(service: ServiceId, input: unknown) {
  try {
    return parseServiceRequest(service, input);
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    const path = error.issues[0]?.path[0];
    const messages: Record<string, string> = {
      roomType: "Enter a room type of 1–80 characters.",
      style: "Keep the furniture style within 80 characters.",
      mood: "Keep the mood within 80 characters.",
      direction: "Keep additional direction within 600 characters.",
      options:
        "Choose at least one supported exterior improvement, without duplicates.",
      preset: "Choose pink twilight, blue hour or natural dusk.",
      placements: "Place every furniture piece once inside the room photo.",
      furnitureAssetIds: "Add 1–5 separate furniture photos.",
      regions:
        "Check each painted region and keep its instruction within 600 characters.",
    };
    throw new StudioInputError(
      messages[String(path)] ??
        "Check the selected photos and service settings before continuing.",
    );
  }
}

/** One payload builder for validation and the actual existing customer API. */
export function studioRequest(
  service: ServiceId,
  input: StudioInput,
  assets: string[],
  furniture: string[],
  regions: UploadedMask[],
) {
  if (
    assets.length !== input.files.length ||
    (service === "reference_furniture" &&
      furniture.length !== input.furniture.length)
  )
    throw new StudioInputError(
      "The uploaded photos do not match this edit. Nothing was submitted.",
    );
  const assetId = assets[0];
  switch (service) {
    case "virtual_staging":
      return parse(service, {
        assetId,
        roomType: input.roomType,
        style: input.style,
        mood: input.mood,
        direction: input.direction,
      });
    case "multiview":
      return parse(service, {
        assetIds: assets,
        anchorAssetId: assets[input.anchor],
        roomType: input.roomType,
        style: input.style,
        mood: input.mood,
        direction: input.direction,
      });
    case "twilight":
      return parse(service, {
        assetId,
        feature: service,
        preset: input.preset,
      });
    case "winter_to_summer":
      return parse(service, { assetId, feature: service });
    case "exterior_enhancement":
      return parse(service, {
        assetId,
        feature: service,
        options: input.options,
      });
    case "floor_plan":
      return parse(service, { assetId });
    case "reference_furniture":
      return parse(service, {
        assetId,
        direction: input.direction,
        furnitureAssetIds: furniture,
        placements: furniture.map((furnitureAssetId, index) => ({
          furnitureAssetId,
          ...input.pins[index],
        })),
      });
    case "item_removal":
    case "custom_staging":
      return parse(service, {
        assetId,
        mode: service === "item_removal" ? "remove" : "custom",
        regions,
      });
  }
}

/** Runs before demo/live branching or uploads. Synthetic IDs never leave here. */
export function validateStudioInput(
  service: ServiceId,
  input: StudioInput,
  regions: PaintRegion[] = [],
) {
  if (!z.uuid().safeParse(input.projectId).success)
    throw new StudioInputError("Choose a property project before continuing.");
  const multi = service === "multiview";
  if (
    input.files.length < (multi ? 2 : 1) ||
    input.files.length > (multi ? 4 : 1)
  )
    throw new StudioInputError(
      multi
        ? "Choose 2–4 different views of the same room."
        : "Choose one source photo or floor-plan file.",
    );
  input.files.forEach((file) => validFile(file, service === "floor_plan"));
  if (new Set(input.files.map((file) => file.uri)).size !== input.files.length)
    throw new StudioInputError(
      "Each room view must be a different selected photo.",
    );
  if (
    multi &&
    (!Number.isInteger(input.anchor) ||
      input.anchor < 0 ||
      input.anchor >= input.files.length)
  )
    throw new StudioInputError(
      "Choose one of your room views as the design anchor.",
    );
  const references = service === "reference_furniture" ? input.furniture : [];
  if (service === "reference_furniture") {
    if (!references.length || references.length > 5)
      throw new StudioInputError(
        "Add 1–5 furniture photos, then place each piece.",
      );
    references.forEach((file) => validFile(file, false));
    const paths = [...input.files, ...references].map((file) => file.uri);
    if (new Set(paths).size !== paths.length)
      throw new StudioInputError(
        "Use separate selections for the room and each furniture photo.",
      );
  }
  const masks = regions.flatMap((region, regionIndex) =>
    region.strokes.some((stroke) => stroke.points.length)
      ? [
          {
            // Geometry is checked again by the real native mask exporter. These keys
            // and boxes exist solely to validate the form against its frozen schema.
            bbox: { x: 0, y: 0, width: 1, height: 1 },
            maskKey: "validation-only",
            compositeMaskKey: "validation-only",
            instruction: region.instruction,
            operation: region.operation,
            regionIndex,
          },
        ]
      : [],
  );
  if (service === "item_removal" || service === "custom_staging") {
    if (!masks.length)
      throw new StudioInputError("Paint at least one area on the photo.");
    if (regions.length > 8)
      throw new StudioInputError("Use no more than eight regions.");
    if (
      service === "custom_staging" &&
      masks.some((region) => !region.instruction.trim())
    )
      throw new StudioInputError(
        "Describe the change for every painted region.",
      );
    if (
      service === "item_removal" &&
      masks.some((region) => region.operation !== "remove")
    )
      throw new StudioInputError("Item removal regions must use Remove.");
  }
  const validationId = (index: number) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  studioRequest(
    service,
    input,
    input.files.map((_, i) => validationId(i)),
    references.map((_, i) => validationId(i + 10)),
    masks,
  );
}
