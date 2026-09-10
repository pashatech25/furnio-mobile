import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApi } from "./client";
import { createMediaUploads } from "./media-upload";
import {
  createOperationManager,
  type OperationSession,
} from "../auth/operation-scope";
import type { LocalPhoto } from "../media";

const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const asset = "11111111-1111-4111-8111-111111111111",
  project = "22222222-2222-4222-8222-222222222222";
const photo: LocalPhoto = {
  uri: "file:///private/fixture.jpg",
  name: "room.jpg",
  contentType: "image/jpeg",
  bytes: 3,
  width: 100,
  height: 100,
};
const signed = {
  assetId: asset,
  expiresAt: "2026-09-10T00:00:00Z",
  uploadUrl: "https://storage.example/fixture?signed=secret",
  headers: { "Content-Type": "image/jpeg" },
};
const completed = {
  assetId: asset,
  status: "ready",
  width: 100,
  height: 100,
  previewUrl: null,
  previewExpiresAt: null,
};
function session(id = user): OperationSession {
  return {
    user: { id },
    access_token: `x.${btoa(JSON.stringify({ sub: id, session_id: asset }))}.x`,
  };
}
function fixture(
  interruptAt?: "read" | "presign" | "put" | "complete" | "json",
) {
  let current = session();
  const listeners = new Set<(session: OperationSession | null) => void>();
  const change = () => {
    current = session(other);
    for (const cb of [...listeners]) cb(current);
  };
  const manager = createOperationManager({
    read: async () => current,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  });
  const parent = new AbortController(),
    scope = manager.begin(user, parent.signal);
  const readBytes = vi.fn(async () => {
    if (interruptAt === "read") change();
    return new Uint8Array([1, 2, 3]).buffer;
  });
  const fetcher = vi.fn(
    async (
      url: string | URL | Request,
      options?: RequestInit,
    ): Promise<Response> => {
      const value = String(url);
      if (options?.method === "PUT") {
        if (interruptAt === "put") change();
        return new Response(null, { status: 200 });
      }
      if (value.endsWith("/mask/presign"))
        return Response.json({ ...signed, maskKey: "fixture-mask" });
      if (value.endsWith("/presign")) {
        if (interruptAt === "presign") change();
        return Response.json(signed);
      }
      if (value.endsWith("/complete")) {
        if (interruptAt === "complete") change();
        const response = Response.json(completed);
        if (interruptAt === "json")
          response.json = async () => {
            change();
            return completed;
          };
        return response;
      }
      return Response.json({ ok: true });
    },
  );
  const api = createApi("https://api.example", scope.getToken, fetcher, scope);
  const uploads = createMediaUploads({
    api,
    readBytes,
    fetcher,
    boundary: scope,
  });
  return { uploads, api, fetcher, readBytes, scope, parent, change };
}
describe("session-bound media uploads", () => {
  it("uploads exact bytes and completes using the same session; PUT never gets a bearer", async () => {
    const f = fixture();
    expect(
      await f.uploads.uploadPhoto(photo, project, "virtual_staging"),
    ).toEqual(completed);
    expect(f.fetcher).toHaveBeenCalledTimes(3);
    expect(f.fetcher.mock.calls[0]![1]!.headers).toMatchObject({
      Authorization: `Bearer ${session().access_token}`,
    });
    expect(f.fetcher.mock.calls[1]).toEqual([
      signed.uploadUrl,
      expect.objectContaining({
        method: "PUT",
        headers: signed.headers,
        redirect: "error",
      }),
    ]);
    expect(f.fetcher.mock.calls[2]![1]!.headers).toMatchObject({
      Authorization: `Bearer ${session().access_token}`,
    });
    f.scope.dispose();
  });
  it.each(["read", "presign", "put", "complete", "json"] as const)(
    "stops after identity changes during %s; no next upload or job",
    async (stage) => {
      const f = fixture(stage);
      const run = async () => {
        await f.uploads.uploadPhoto(photo, project, "virtual_staging");
        await f.uploads.uploadPhoto(photo, project, "virtual_staging");
        await f.api(
          "/api/mobile/v1/jobs/stage",
          z.object({ ok: z.boolean() }),
          {},
          { expectedCredits: 5 },
        );
      };
      await expect(run()).rejects.toThrow();
      expect(f.scope.current).toBe(false);
      expect(f.fetcher).toHaveBeenCalledTimes(
        { read: 0, presign: 1, put: 2, complete: 3, json: 3 }[stage],
      );
      for (const [, options] of f.fetcher.mock.calls)
        expect(JSON.stringify(options?.headers)).not.toContain(
          session(other).access_token,
        );
    },
  );
  it("does not presign a missing or changed file", async () => {
    const f = fixture();
    f.readBytes.mockResolvedValueOnce(new ArrayBuffer(2));
    await expect(
      f.uploads.uploadPhoto(photo, project, "virtual_staging"),
    ).rejects.toThrow("changed");
    expect(f.fetcher).not.toHaveBeenCalled();
    f.scope.dispose();
  });
  it("does not complete or retry a failed PUT", async () => {
    const f = fixture();
    f.fetcher
      .mockImplementationOnce(async () => Response.json(signed))
      .mockRejectedValueOnce(new Error("secret signed URL"));
    await expect(
      f.uploads.uploadPhoto(photo, project, "virtual_staging"),
    ).rejects.toThrow("job has not been submitted");
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    f.scope.dispose();
  });
  it("rejects completion for the wrong asset", async () => {
    const f = fixture();
    f.fetcher
      .mockImplementationOnce(async () => Response.json(signed))
      .mockImplementationOnce(async () => new Response())
      .mockImplementationOnce(async () =>
        Response.json({ ...completed, assetId: other }),
      );
    await expect(
      f.uploads.uploadPhoto(photo, project, "virtual_staging"),
    ).rejects.toThrow("did not match");
    f.scope.dispose();
  });
  it.each(["Authorization", "authorization", "Cookie", "Proxy-Authorization"])(
    "rejects %s in signed storage headers",
    async (header) => {
      const f = fixture();
      f.fetcher.mockImplementationOnce(async () =>
        Response.json({ ...signed, headers: { [header]: "secret" } }),
      );
      await expect(
        f.uploads.uploadPhoto(photo, project, "virtual_staging"),
      ).rejects.toThrow("unsafe upload headers");
      expect(f.fetcher).toHaveBeenCalledTimes(1);
      f.scope.dispose();
    },
  );
  it.each([
    "http://storage.example/file",
    "https://user:secret@storage.example/file",
  ])("rejects insecure signed destination %s", async (url) => {
    const f = fixture();
    f.fetcher.mockImplementationOnce(async () =>
      Response.json({ ...signed, uploadUrl: url }),
    );
    await expect(
      f.uploads.uploadPhoto(photo, project, "virtual_staging"),
    ).rejects.toThrow("insecure upload URL");
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    f.scope.dispose();
  });
  it("aborts a reserved photo before completion if the account changes during storage PUT", async () => {
    const f = fixture("put");
    await expect(
      f.uploads.uploadReservedPhoto(photo, {
        ...signed,
        contentLength: 3,
        fileName: photo.name,
        itemId: project,
        position: 0,
      }),
    ).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("aborts a mask upload and never returns its key after account replacement", async () => {
    const f = fixture("put");
    await expect(
      f.uploads.uploadMask(btoa("abc"), "item_removal", project),
    ).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it("retains mask and multi-view parameters without allowing master prompts", async () => {
    const f = fixture();
    await f.uploads.uploadMask(btoa("abc"), "custom_staging", project);
    expect(JSON.parse(String(f.fetcher.mock.calls[0]![1]!.body))).toEqual({
      contentLength: 3,
      contentType: "image/png",
      featureSlug: "custom_staging",
      batchItemId: project,
    });
    f.fetcher.mockClear();
    await f.uploads.uploadPhoto(photo, project, "multiview", {
      roomGroupId: other,
      viewIndex: 1,
      isAnchor: true,
      countsTowardPhotoLimit: false,
    });
    expect(JSON.parse(String(f.fetcher.mock.calls[0]![1]!.body))).toMatchObject(
      {
        roomGroupId: other,
        viewIndex: 1,
        isAnchor: true,
        countsTowardPhotoLimit: false,
      },
    );
    f.scope.dispose();
  });
  it("rejects oversized masks before allocating storage", async () => {
    const f = fixture();
    await expect(
      f.uploads.uploadMask("A".repeat(7_000_000), "item_removal"),
    ).rejects.toThrow("5 MB");
    expect(f.fetcher).not.toHaveBeenCalled();
    f.scope.dispose();
  });
  it("cancels the in-flight PUT when its screen closes", async () => {
    const f = fixture();
    let dispatched!: () => void;
    const started = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    f.fetcher
      .mockImplementationOnce(async () => Response.json(signed))
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options!.signal!.addEventListener(
              "abort",
              () => reject(new Error("cancelled")),
              { once: true },
            );
            dispatched();
          }),
      );
    const pending = f.uploads.uploadPhoto(photo, project, "virtual_staging");
    await started;
    f.parent.abort();
    await expect(pending).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
});
