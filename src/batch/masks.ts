import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { createMaskStore, type PreparedMask } from "./mask-store";
import { fileBytes } from "../media";
import type { createMediaUploads } from "../api/media-upload";
export type { PreparedMask } from "./mask-store";
const prefix = "furnio-batch-mask-";
export function createNativeMaskStore() {
  return createMaskStore(
    () => new File(Paths.cache, `${prefix}${Crypto.randomUUID()}.png`),
  );
}
export async function uploadPreparedMasks(
  masks: PreparedMask[],
  service: "item_removal" | "custom_staging",
  batchItemId: string,
  sendMask: ReturnType<typeof createMediaUploads>["uploadMask"],
  assertCurrent: () => void,
) {
  const regions = [];
  for (const { binaryUri, compositeUri, ...region } of masks) {
    assertCurrent();
    const base64 = async (uri: string) => {
      assertCurrent();
      const bytes = new Uint8Array(await fileBytes(uri));
      assertCurrent();
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return btoa(binary);
    };
    regions.push({
      ...region,
      maskKey: await sendMask(await base64(binaryUri), service, batchItemId),
      compositeMaskKey: await sendMask(
        await base64(compositeUri),
        service,
        batchItemId,
      ),
    });
  }
  assertCurrent();
  return regions;
}
