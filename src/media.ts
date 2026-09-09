import { Platform } from "react-native";
import * as Picker from "expo-image-picker";
import * as Documents from "expo-document-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { z } from "zod";
import { api } from "./state";
import {
  MAX_UPLOAD_BYTES,
  completeUploadResponseSchema,
  presignUploadSchema,
  presignUploadResponseSchema,
  presignMaskResponseSchema,
  type ReserveBatchResponse,
} from "./contracts/uploads";
import type { ServiceId } from "./services";

export type LocalPhoto = {
  uri: string;
  name: string;
  contentType: "image/jpeg" | "application/pdf";
  bytes: number;
  width: number;
  height: number;
};
export async function fileBytes(uri: string): Promise<ArrayBuffer> {
  return Platform.OS === "web"
    ? (await fetch(uri)).arrayBuffer()
    : new File(uri).arrayBuffer();
}
export async function choosePhotos(
  limit = 1,
  camera = false,
): Promise<LocalPhoto[]> {
  if (camera) {
    const permission = await Picker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        "Camera permission is needed to take a photo. You can still choose an existing photo.",
      );
  }
  const result = camera
    ? await Picker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
    : await Picker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: limit > 1,
        selectionLimit: limit,
        quality: 1,
        orderedSelection: true,
      });
  if (result.canceled) return [];
  const output: LocalPhoto[] = [];
  for (const asset of result.assets.slice(0, limit)) {
    // Normalises HEIC/PNG and device orientation into the JPEG contract before masks or placements are drawn.
    const image = await ImageManipulator.manipulate(asset.uri).renderAsync();
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.95,
    });
    const bytes = (await fileBytes(saved.uri)).byteLength;
    if (bytes > MAX_UPLOAD_BYTES)
      throw new Error(
        "This photo exceeds 20 MB. Export a smaller JPEG before uploading.",
      );
    output.push({
      uri: saved.uri,
      name:
        (asset.fileName ?? "property-photo").replace(/\.[^.]+$/, "") + ".jpg",
      contentType: "image/jpeg",
      bytes,
      width: saved.width,
      height: saved.height,
    });
  }
  return output;
}
export async function chooseFloorplan(): Promise<LocalPhoto[]> {
  const result = await Documents.getDocumentAsync({
    type: ["application/pdf", "image/jpeg"],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  const file = result.assets[0];
  if (!file) return [];
  const bytes = file.size ?? (await fileBytes(file.uri)).byteLength;
  if (bytes > MAX_UPLOAD_BYTES)
    throw new Error("Floor plans must be 20 MB or smaller.");
  if (file.mimeType === "image/jpeg") {
    const image = await ImageManipulator.manipulate(file.uri).renderAsync();
    const jpeg = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.95,
    });
    return [
      {
        uri: jpeg.uri,
        name: file.name,
        bytes: (await fileBytes(jpeg.uri)).byteLength,
        contentType: "image/jpeg",
        width: jpeg.width,
        height: jpeg.height,
      },
    ];
  }
  if (file.mimeType !== "application/pdf")
    throw new Error("Choose a JPEG or single-page PDF.");
  // The existing server validates PDF pages and content. Never guess page count from raw PDF text.
  return [
    {
      uri: file.uri,
      name: file.name,
      bytes,
      contentType: "application/pdf",
      width: 1,
      height: 1,
    },
  ];
}
async function putBytes(
  url: string,
  headers: Record<string, string>,
  bytes: ArrayBuffer,
) {
  if (new URL(url).protocol !== "https:")
    throw new Error("The server returned an insecure upload URL.");
  // Signed storage requests must NOT include the customer's bearer token.
  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: bytes,
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok)
    throw new Error(
      "Photo upload was interrupted. Your job has not been submitted.",
    );
}
export async function uploadPhoto(
  file: LocalPhoto,
  projectId: string,
  service: ServiceId,
  extra: {
    roomGroupId?: string;
    viewIndex?: number;
    isAnchor?: boolean;
    countsTowardPhotoLimit?: boolean;
  } = {},
) {
  const request = presignUploadSchema.parse({
    projectId,
    featureSlug: service,
    fileName: file.name,
    contentType: file.contentType,
    contentLength: file.bytes,
    ...extra,
  });
  const signed = await api(
    "/api/uploads/presign",
    presignUploadResponseSchema,
    request,
  );
  await putBytes(signed.uploadUrl, signed.headers, await fileBytes(file.uri));
  return api(
    `/api/uploads/${signed.assetId}/complete`,
    completeUploadResponseSchema,
    {},
  );
}
export async function uploadMask(
  base64: string,
  service: "item_removal" | "custom_staging",
  batchItemId?: string,
) {
  const binary = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );
  if (binary.byteLength > 5 * 1024 * 1024)
    throw new Error("The painted mask exceeds the 5 MB server limit.");
  const signed = await api(
    "/api/uploads/mask/presign",
    presignMaskResponseSchema,
    {
      contentLength: binary.byteLength,
      contentType: "image/png",
      featureSlug: service,
      ...(batchItemId ? { batchItemId } : {}),
    },
  );
  await putBytes(signed.uploadUrl, signed.headers, binary.buffer);
  return signed.maskKey;
}
export async function uploadReservedPhoto(
  file: LocalPhoto,
  signed: ReserveBatchResponse["items"][number],
) {
  const bytes = await fileBytes(file.uri);
  if (bytes.byteLength !== signed.contentLength)
    throw new Error(
      "This photo changed after the batch was reserved. It was not uploaded.",
    );
  await putBytes(signed.uploadUrl, signed.headers, bytes);
  const completed = await api(
    `/api/uploads/${signed.assetId}/complete`,
    completeUploadResponseSchema,
    {},
  );
  if (completed.assetId !== signed.assetId)
    throw new Error("The completed upload did not match its reservation.");
}
export async function cleanDownloadUrl(assetId: string) {
  z.uuid().parse(assetId);
  return api(
    `/api/assets/${assetId}/download`,
    z.object({ downloadUrl: z.url(), expiresAt: z.string() }),
  );
}
