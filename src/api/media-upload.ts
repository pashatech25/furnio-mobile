import {
  completeUploadResponseSchema,
  presignUploadSchema,
  presignUploadResponseSchema,
  presignMaskResponseSchema,
  type ReserveBatchResponse,
} from "../contracts/uploads";
import type { LocalPhoto } from "../media";
import type { ServiceId } from "../services";
import type { ApiClient } from "./client";
import { requestDeadline, type RequestBoundary } from "./deadline";

export function createMediaUploads(deps: {
  api: ApiClient;
  readBytes: (uri: string) => Promise<ArrayBuffer>;
  fetcher?: typeof fetch;
  boundary: RequestBoundary;
}) {
  const check = () => deps.boundary.assertCurrent();
  async function bytesFor(file: LocalPhoto, expected = file.bytes) {
    check();
    const bytes = await deps.readBytes(file.uri);
    check();
    if (bytes.byteLength !== expected)
      throw new Error(
        "This photo changed after selection. Choose the photo again; it was not uploaded.",
      );
    return bytes;
  }
  async function put(
    url: string,
    headers: Record<string, string>,
    bytes: ArrayBuffer,
  ) {
    check();
    const target = new URL(url);
    if (target.protocol !== "https:" || target.username || target.password)
      throw new Error("The server returned an insecure upload URL.");
    // Never let JSON API credentials escape into a signed object-storage PUT.
    if (
      Object.keys(headers).some((key) =>
        /^(authorization|cookie|proxy-authorization)$/i.test(key),
      )
    )
      throw new Error("The server returned unsafe upload headers.");
    const deadline = requestDeadline(120_000, [deps.boundary?.signal]);
    try {
      const response = await (deps.fetcher ?? fetch)(url, {
        method: "PUT",
        headers,
        body: bytes,
        redirect: "error",
        signal: deadline.signal,
      });
      check();
      if (!response.ok || deadline.signal.aborted)
        throw new Error("Upload stopped.");
    } catch {
      check();
      // Do not expose signed URLs, local file paths or native networking errors.
      throw new Error(
        "Photo upload was interrupted. Your job has not been submitted.",
      );
    } finally {
      deadline.dispose();
    }
  }
  async function complete(assetId: string) {
    check();
    const completed = await deps.api(
      `/api/uploads/${assetId}/complete`,
      completeUploadResponseSchema,
      {},
    );
    check();
    if (completed.assetId !== assetId)
      throw new Error("The completed upload did not match its reservation.");
    return completed;
  }
  return {
    async uploadPhoto(
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
      check();
      const request = presignUploadSchema.parse({
        projectId,
        featureSlug: service,
        fileName: file.name,
        contentType: file.contentType,
        contentLength: file.bytes,
        ...extra,
      });
      const bytes = await bytesFor(file);
      const signed = await deps.api(
        "/api/uploads/presign",
        presignUploadResponseSchema,
        request,
      );
      check();
      await put(signed.uploadUrl, signed.headers, bytes);
      return complete(signed.assetId);
    },
    async uploadMask(
      base64: string,
      service: "item_removal" | "custom_staging",
      batchItemId?: string,
    ) {
      check();
      if (base64.length > Math.ceil((5 * 1024 * 1024) / 3) * 4)
        throw new Error("The painted mask exceeds the 5 MB server limit.");
      const binary = Uint8Array.from(atob(base64), (character) =>
        character.charCodeAt(0),
      );
      if (!binary.byteLength || binary.byteLength > 5 * 1024 * 1024)
        throw new Error("The painted mask must be between 1 byte and 5 MB.");
      const signed = await deps.api(
        "/api/uploads/mask/presign",
        presignMaskResponseSchema,
        {
          contentLength: binary.byteLength,
          contentType: "image/png",
          featureSlug: service,
          ...(batchItemId ? { batchItemId } : {}),
        },
      );
      check();
      await put(signed.uploadUrl, signed.headers, binary.buffer);
      check();
      return signed.maskKey;
    },
    async uploadReservedPhoto(
      file: LocalPhoto,
      signed: ReserveBatchResponse["items"][number],
    ) {
      const bytes = await bytesFor(file, signed.contentLength);
      await put(signed.uploadUrl, signed.headers, bytes);
      await complete(signed.assetId);
    },
  };
}
