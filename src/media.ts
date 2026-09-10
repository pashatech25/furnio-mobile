import { Platform } from "react-native";
import * as Picker from "expo-image-picker";
import * as Documents from "expo-document-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { z } from "zod";
import { api } from "./state";
import { MAX_UPLOAD_BYTES } from "./contracts/uploads";
import type { InputTransaction } from "./media/native-inputs";

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
  transaction: InputTransaction,
  limit = 1,
  camera = false,
): Promise<LocalPhoto[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
    throw new Error("Choose between 1 and 50 photos.");
  transaction.assertCurrent();
  if (camera) {
    const permission = await Picker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        "Camera permission is needed to take a photo. You can still choose an existing photo.",
      );
  }
  transaction.assertCurrent();
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
  const clean = rememberSelection(transaction, result.assets, "picker");
  try {
    transaction.assertCurrent();
    const output: LocalPhoto[] = [];
    for (const asset of result.assets.slice(0, limit)) {
      output.push(
        await normalizePhoto(
          transaction,
          asset.uri,
          (asset.fileName ?? "property-photo").replace(/\.[^.]+$/, "") + ".jpg",
        ),
      );
    }
    return output;
  } finally {
    clean(); // Includes excess selections and copies returned after cancellation.
  }
}
export async function chooseFloorplan(
  transaction: InputTransaction,
): Promise<LocalPhoto[]> {
  transaction.assertCurrent();
  const result = await Documents.getDocumentAsync({
    type: ["application/pdf", "image/jpeg"],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  const clean = rememberSelection(transaction, result.assets, "document");
  try {
    transaction.assertCurrent();
    const file = result.assets[0];
    if (!file) return [];
    if (file.mimeType === "image/jpeg")
      return [
        await normalizePhoto(
          transaction,
          file.uri,
          file.name.replace(/\.[^.]+$/, "") + ".jpg",
        ),
      ];
    if (file.mimeType !== "application/pdf")
      throw new Error("Choose a JPEG or single-page PDF.");
    const bytes = await checkedFileSize(file.uri);
    transaction.assertCurrent();
    // The server still validates PDF content/page count. Only the private copy
    // is kept while editing; the external Files document is never deleted.
    return [
      {
        uri: await transaction.copy(file.uri, "pdf"),
        name: file.name,
        bytes,
        contentType: "application/pdf",
        width: 1,
        height: 1,
      },
    ];
  } finally {
    clean();
  }
}

function rememberSelection(
  transaction: InputTransaction,
  assets: { uri: string }[],
  source: "picker" | "document",
) {
  const removals: (() => void)[] = [];
  let failure: unknown;
  // Register every returned SDK copy, even if one entry or later conversion is
  // invalid. Do not abandon earlier/later files on the first exception.
  for (const asset of assets) {
    try {
      removals.push(transaction.rememberSdk(asset.uri, source));
    } catch (error) {
      failure ??= error;
    }
  }
  const clean = () => {
    let cleanupFailure: unknown;
    for (const remove of removals) {
      try {
        remove();
      } catch (error) {
        cleanupFailure ??= error;
      }
    }
    if (cleanupFailure) throw cleanupFailure;
  };
  if (failure) {
    clean();
    throw failure;
  }
  return clean;
}
async function checkedFileSize(uri: string) {
  // Native metadata avoids allocating an unbounded ArrayBuffer simply to
  // measure a file; do not trust picker-supplied size for upload validation.
  const bytes =
    Platform.OS === "web"
      ? (await fileBytes(uri)).byteLength
      : new File(uri).size;
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_UPLOAD_BYTES)
    throw new Error("Choose a non-empty image or PDF of 20 MB or smaller.");
  return bytes;
}
async function normalizePhoto(
  transaction: InputTransaction,
  uri: string,
  name: string,
): Promise<LocalPhoto> {
  transaction.assertCurrent();
  await checkedFileSize(uri);
  transaction.assertCurrent();
  // Normalises HEIC/PNG and device orientation before masks or placement.
  const context = ImageManipulator.manipulate(uri);
  let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  let remove: (() => void) | undefined;
  try {
    image = await context.renderAsync();
    transaction.assertCurrent();
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.95,
    });
    remove = transaction.rememberSdk(saved.uri, "manipulator");
    transaction.assertCurrent();
    const bytes = await checkedFileSize(saved.uri);
    transaction.assertCurrent();
    if (
      ![saved.width, saved.height].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    )
      throw new Error(
        "This photo has invalid dimensions. Choose another file.",
      );
    return {
      uri: await transaction.copy(saved.uri, "jpg"),
      name,
      contentType: "image/jpeg",
      bytes,
      width: saved.width,
      height: saved.height,
    };
  } finally {
    try {
      remove?.();
    } finally {
      try {
        image?.release();
      } finally {
        context.release();
      }
    }
  }
}
export async function cleanDownloadUrl(assetId: string) {
  z.uuid().parse(assetId);
  return api(
    `/api/assets/${assetId}/download`,
    z.object({ downloadUrl: z.url(), expiresAt: z.string() }),
  );
}
