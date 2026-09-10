import type { MaskExport } from "../editor/mask-export";

export type PreparedMask = Omit<MaskExport, "binary" | "composite"> & {
  binaryUri: string;
  compositeUri: string;
};
type OwnedMaskFile = {
  readonly uri: string;
  readonly exists: boolean;
  create: () => void;
  write: (bytes: Uint8Array) => void;
  delete: () => void;
};

/** Factory must return a NEW app-owned cache file, never a picker/original URI. */
export function createMaskStore(makeFile: () => OwnedMaskFile) {
  const saved = new Map<string, PreparedMask[]>();
  const owned = new Map<string, OwnedMaskFile>();
  const garbage = new Set<string>();
  function cleanup() {
    for (const uri of garbage) {
      const file = owned.get(uri);
      if (!file) {
        garbage.delete(uri);
        continue;
      }
      try {
        if (file.exists) file.delete();
        if (!file.exists) {
          garbage.delete(uri);
          owned.delete(uri);
        }
      } catch {
        // Attempt the other owned files and retain this exact handle for retry.
      }
    }
    return garbage.size;
  }
  function retire(masks: PreparedMask[]) {
    for (const mask of masks)
      for (const uri of [mask.binaryUri, mask.compositeUri])
        if (owned.has(uri)) garbage.add(uri);
  }
  return {
    cleanup,
    get pending() {
      return garbage.size;
    },
    save(
      photoId: string,
      masks: MaskExport[],
      validate: (prepared: PreparedMask[]) => void,
    ): PreparedMask[] {
      if (cleanup())
        throw new Error(
          "Retry temporary-mask cleanup before reviewing another photo.",
        );
      if (!photoId || !masks.length || masks.length > 8)
        throw new Error("Review between one and eight painted regions.");
      // Validate every encoded payload before creating any file.
      const decoded = masks.map(({ binary, composite, ...region }) => {
        const decode = (value: string) => {
          if (
            !value.startsWith("iVBORw0KGgo") ||
            value.length > Math.ceil((5 * 1024 * 1024) / 3) * 4 ||
            value.length % 4 !== 0 ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
          )
            throw new Error("The prepared mask is not a valid PNG.");
          const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
          if (bytes.byteLength > 5 * 1024 * 1024)
            throw new Error(
              "A painted mask exceeds 5 MB. Use smaller regions.",
            );
          return bytes;
        };
        return { region, binary: decode(binary), composite: decode(composite) };
      });
      const created: string[] = [];
      let next: PreparedMask[];
      try {
        next = decoded.map(({ region, binary, composite }) => {
          const write = (bytes: Uint8Array) => {
            const file = makeFile();
            if (owned.has(file.uri) || file.exists)
              throw new Error("A fresh temporary mask could not be allocated.");
            // Claim before create/write so partial failures are still owned.
            owned.set(file.uri, file);
            created.push(file.uri);
            file.create();
            file.write(bytes);
            return file.uri;
          };
          return {
            ...region,
            binaryUri: write(binary),
            compositeUri: write(composite),
          };
        });
        validate(next);
      } catch {
        for (const uri of created) garbage.add(uri);
        cleanup();
        throw new Error(
          "The painted masks could not be prepared. Your previous review is unchanged. Please try again.",
        );
      }
      const previous = saved.get(photoId) ?? [];
      // Keep ownership metadata private even if a consumer edits its result.
      saved.set(
        photoId,
        next.map((mask) => ({ ...mask })),
      );
      retire(previous);
      cleanup();
      return next;
    },
    remove(photoId: string) {
      retire(saved.get(photoId) ?? []);
      saved.delete(photoId);
      return cleanup();
    },
    clear() {
      for (const masks of saved.values()) retire(masks);
      saved.clear();
      return cleanup();
    },
  };
}
