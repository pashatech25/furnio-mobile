import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import type { MaskExport } from "../editor/MaskEditor";
import { fileBytes, uploadMask } from "../media";
export type PreparedMask = Omit<MaskExport, "binary" | "composite"> & {
  binaryUri: string;
  compositeUri: string;
};
const prefix = "furnio-batch-mask-";
export function removePreparedMasks(masks: PreparedMask[]) {
  for (const mask of masks)
    for (const uri of [mask.binaryUri, mask.compositeUri]) {
      const file = new File(uri);
      if (
        file.parentDirectory.uri === Paths.cache.uri &&
        file.name.startsWith(prefix) &&
        file.exists
      )
        file.delete();
    }
}
export function savePreparedMasks(masks: MaskExport[]): PreparedMask[] {
  const created: File[] = [];
  try {
    return masks.map(({ binary, composite, ...region }) => {
      const write = (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (character) =>
          character.charCodeAt(0),
        );
        if (bytes.byteLength > 5 * 1024 * 1024)
          throw new Error("A painted mask exceeds 5 MB. Use smaller regions.");
        const file = new File(
          Paths.cache,
          `${prefix}${Crypto.randomUUID()}.png`,
        );
        file.create();
        created.push(file);
        file.write(bytes);
        return file.uri;
      };
      return {
        ...region,
        binaryUri: write(binary),
        compositeUri: write(composite),
      };
    });
  } catch (error) {
    for (const file of created) if (file.exists) file.delete();
    throw error;
  }
}
export async function uploadPreparedMasks(
  masks: PreparedMask[],
  service: "item_removal" | "custom_staging",
  batchItemId: string,
) {
  const regions = [];
  for (const { binaryUri, compositeUri, ...region } of masks) {
    const base64 = async (uri: string) => {
      const bytes = new Uint8Array(await fileBytes(uri));
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return btoa(binary);
    };
    regions.push({
      ...region,
      maskKey: await uploadMask(await base64(binaryUri), service, batchItemId),
      compositeMaskKey: await uploadMask(
        await base64(compositeUri),
        service,
        batchItemId,
      ),
    });
  }
  return regions;
}
