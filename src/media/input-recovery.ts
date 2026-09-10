// Only SDK-generated cache basenames are journalled. No account IDs, original
// names, photo contents, remote URLs or auth/recovery receipts are stored here.
export const INPUT_ROOT = "furnio-photo-inputs-v1";
const uuid =
  "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
const idPattern = new RegExp(`^${uuid}$`);
const inputPattern = new RegExp(`^input-${uuid}\\.(jpg|pdf)$`);
const sdkPattern = new RegExp(
  `^${uuid}\\.?(jpg|jpeg|png|heic|heif|webp|gif|avif|bmp|pdf)$`,
  "i",
);
const markerPattern = new RegExp(
  `^sdk-(picker|picker-root|document|manipulator)-(${uuid}\\.?(?:jpg|jpeg|png|heic|heif|webp|gif|avif|bmp|pdf))\\.owned$`,
  "i",
);
export type InputSdk = "picker" | "picker-root" | "document" | "manipulator";
type Entry = { name: string; kind: "file" | "directory" };
export type InputRecoveryIO = {
  sessions(): Entry[];
  entries(id: string): Entry[];
  create(id: string): void;
  exists(id: string, name: string): boolean;
  marker(id: string, name: string): void;
  remove(id: string, name: string): void;
  removeSdk(kind: InputSdk, name: string): void;
  removeEmpty(id: string): void;
};
export class InputCleanupError extends Error {
  constructor() {
    super(
      "Temporary photo cleanup needs attention. Retry temporary photo cleanup before choosing more files. Your originals and saved drafts are unchanged.",
    );
  }
}

export function inputSdkFile(
  uri: string,
  cacheUri: string,
  source: "picker" | "document" | "manipulator",
  platform: string,
) {
  if (!cacheUri.startsWith("file://") || /[?#\\]/.test(uri)) return null;
  const cache = cacheUri.replace(/\/$/, "") + "/";
  const directory = {
    picker: "ImagePicker/",
    document: "DocumentPicker/",
    manipulator: "ImageManipulator/",
  }[source];
  // The installed iOS picker may use the cache root when its cache path ends
  // in a slash. Only a UUID basename returned by that picker qualifies.
  const locations: [string, InputSdk][] = [[cache + directory, source]];
  if (source === "picker" && platform === "ios")
    locations.push([cache, "picker-root"]);
  for (const [prefix, kind] of locations) {
    if (!uri.startsWith(prefix)) continue;
    const name = uri.slice(prefix.length);
    if (sdkPattern.test(name)) return { kind, name };
  }
  return null;
}

export function createInputRecovery(io: InputRecoveryIO, random: () => string) {
  const active = new Set<string>();
  const unjournalled = new Map<string, { kind: InputSdk; name: string }>();
  // An SDK callback can arrive after close. Its files stay protected while the
  // native operation settles, then are collected by that operation's finally.
  function recover() {
    let failed = 0;
    for (const [key, sdk] of unjournalled) {
      try {
        io.removeSdk(sdk.kind, sdk.name);
        unjournalled.delete(key);
      } catch {
        failed++;
      }
    }
    try {
      const sessions = io.sessions();
      if (sessions.length > 500) return { failed: 1 };
      for (const entry of sessions) {
        if (entry.kind !== "directory" || !idPattern.test(entry.name)) {
          failed++;
          continue;
        }
        if (active.has(entry.name)) continue;
        try {
          const files = io.entries(entry.name);
          if (
            files.length > 500 ||
            files.some(
              (file) =>
                file.kind !== "file" ||
                !(
                  inputPattern.test(file.name) || markerPattern.test(file.name)
                ),
            )
          ) {
            failed++;
            continue;
          }
          for (const file of files) {
            try {
              const sdk = markerPattern.exec(file.name);
              if (sdk) io.removeSdk(sdk[1]!.toLowerCase() as InputSdk, sdk[2]!);
              io.remove(entry.name, file.name);
            } catch {
              failed++;
            }
          }
          if (!io.entries(entry.name).length) io.removeEmpty(entry.name);
        } catch {
          failed++;
        }
      }
    } catch {
      failed++;
    }
    return { failed };
  }
  function start() {
    if (recover().failed) throw new InputCleanupError();
    const id = random();
    if (!idPattern.test(id) || active.has(id)) throw new InputCleanupError();
    try {
      io.create(id);
    } catch {
      // Must not overwrite any existing directory.
      throw new InputCleanupError();
    }
    active.add(id);
    const allocated = new Set<string>();
    let live = true;
    const check = () => {
      if (!live) throw new InputCleanupError();
    };
    return {
      id,
      allocate(extension: "jpg" | "pdf") {
        check();
        const next = random();
        if (!idPattern.test(next) || !["jpg", "pdf"].includes(extension))
          throw new InputCleanupError();
        const name = `input-${next}.${extension}`;
        if (allocated.has(name) || io.exists(id, name))
          throw new InputCleanupError();
        allocated.add(name);
        return name;
      },
      rememberSdk(kind: InputSdk, name: string) {
        check();
        if (
          !["picker", "picker-root", "document", "manipulator"].includes(kind)
        )
          throw new InputCleanupError();
        const marker = `sdk-${kind}-${name}.owned`;
        if (!markerPattern.test(marker)) throw new InputCleanupError();
        if (!io.exists(id, marker)) {
          try {
            io.marker(id, marker);
          } catch {
            // Do not return an unjournalled SDK copy to an editor. Best-effort
            // immediate removal; a disk failure here remains an explicit error.
            unjournalled.set(marker, { kind, name });
            try {
              io.removeSdk(kind, name);
              unjournalled.delete(marker);
            } catch {
              /* Retry in-process; crash-before-journal remains a documented limit. */
            }
            throw new InputCleanupError();
          }
        }
        return () => {
          check();
          try {
            io.removeSdk(kind, name);
            io.remove(id, marker);
          } catch {
            throw new InputCleanupError();
          }
        };
      },
      finish() {
        live = false;
        active.delete(id);
        return recover();
      },
    };
  }
  return { start, recover };
}
