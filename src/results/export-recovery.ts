// No user identifiers, source paths, image data or remote URLs are persisted.
export const EXPORT_ROOT = "furnio-result-exports-v1";
export const SHARE_RETENTION_MS = 24 * 60 * 60 * 1000;
const uuid =
  "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
const sessionPattern = new RegExp(`^${uuid}$`);
const imagePattern = new RegExp(
  `^(source-${uuid}\\.jpg|label-${uuid}\\.png|Furnio-${uuid}\\.jpg)$`,
);
const sdkPattern = new RegExp(`^${uuid}\\.jpg$`);
const markerPattern = new RegExp(`^sdk-(${uuid}\\.jpg)\\.owned$`);
const sharePattern = /^sharing-(\d{13})\.hold$/;
export type ExportKind = "source" | "label" | "final";
export type RecoveryEntry = { name: string; kind: "file" | "directory" };
export type RecoveryReport = { failed: number; retainedShares: number };
export type ExportRecoveryIO = {
  sessions: () => RecoveryEntry[];
  entries: (session: string) => RecoveryEntry[];
  createSession: (session: string) => void;
  exists: (session: string, name: string) => boolean;
  marker: (session: string, name: string) => void;
  removeFile: (session: string, name: string) => void;
  removeSdkFile: (name: string) => void;
  removeEmptySession: (session: string) => void;
};

export class ExportRecoveryError extends Error {
  constructor() {
    super(
      "Temporary photo cleanup needs attention. Retry cleanup before exporting another photo. Originals, saved drafts and cloud work are unchanged.",
    );
  }
}

export function createExportRecovery(
  io: ExportRecoveryIO,
  random: () => string,
  now: () => number,
) {
  const active = new Set<string>();
  function recover(): RecoveryReport {
    const report = { failed: 0, retainedShares: 0 };
    let sessions: RecoveryEntry[];
    let time: number;
    try {
      time = now();
      if (!Number.isSafeInteger(time) || time < 0)
        throw new ExportRecoveryError();
      sessions = io.sessions();
    } catch {
      return { ...report, failed: 1 };
    }
    for (const session of sessions) {
      if (session.kind !== "directory" || !sessionPattern.test(session.name)) {
        report.failed++;
        continue;
      }
      if (active.has(session.name)) continue;
      try {
        const entries = io.entries(session.name);
        // Validate every name before deleting anything in this session. Never
        // recurse into an unexpected directory or follow a metadata-supplied path.
        if (
          entries.some(
            (entry) =>
              entry.kind !== "file" ||
              !(
                imagePattern.test(entry.name) ||
                markerPattern.test(entry.name) ||
                sharePattern.test(entry.name)
              ),
          )
        ) {
          report.failed++;
          continue;
        }
        const shares = entries.flatMap((entry) => {
          const match = sharePattern.exec(entry.name);
          return match ? [Number(match[1])] : [];
        });
        if (shares.some((started) => started > time)) {
          report.failed++;
          continue;
        }
        // A crashed host may have handed this file to a separate share extension.
        // Keep its last known share for a day, then collect on a later foreground/start.
        if (shares.some((started) => time - started < SHARE_RETENTION_MS)) {
          report.retainedShares++;
          continue;
        }
        for (const entry of entries) {
          try {
            const sdk = markerPattern.exec(entry.name);
            if (sdk?.[1]) io.removeSdkFile(sdk[1]); // marker survives a failed removal
            io.removeFile(session.name, entry.name);
          } catch {
            report.failed++;
          }
        }
        if (io.entries(session.name).length === 0)
          io.removeEmptySession(session.name);
      } catch {
        report.failed++;
      }
    }
    return report;
  }
  function start() {
    if (recover().failed) throw new ExportRecoveryError();
    const session = random();
    if (!sessionPattern.test(session) || active.has(session))
      throw new ExportRecoveryError();
    io.createSession(session); // Must fail on collisions, never overwrite a session.
    active.add(session);
    const allocated = new Set<string>();
    let live = true;
    const requireLive = () => {
      if (!live || !active.has(session)) throw new ExportRecoveryError();
    };
    return {
      session,
      allocate(kind: ExportKind) {
        requireLive();
        const id = random();
        if (
          !sessionPattern.test(id) ||
          !["source", "label", "final"].includes(kind)
        )
          throw new ExportRecoveryError();
        const name = `${kind === "final" ? "Furnio" : kind}-${id}.${kind === "label" ? "png" : "jpg"}`;
        if (allocated.has(name) || io.exists(session, name))
          throw new ExportRecoveryError();
        allocated.add(name);
        return name;
      },
      owns(name: string) {
        return live && allocated.has(name);
      },
      rememberSdk(name: string) {
        requireLive();
        if (!sdkPattern.test(name)) throw new ExportRecoveryError();
        const marker = `sdk-${name}.owned`;
        if (!io.exists(session, marker)) io.marker(session, marker);
      },
      beginShare() {
        requireLive();
        const time = now();
        if (!Number.isSafeInteger(time) || !/^\d{13}$/.test(String(time)))
          throw new ExportRecoveryError();
        const name = `sharing-${time}.hold`;
        io.marker(session, name); // persist before opening the native share sheet
        let finished = false;
        return () => {
          if (finished) return;
          // A failed marker cleanup must not claim a successful save/share
          // failed. Conservatively retain the hold for restart recovery.
          try {
            io.removeFile(session, name);
            finished = true;
          } catch {
            /* retry or TTL */
          }
        };
      },
      finish() {
        live = false;
        active.delete(session);
        return recover();
      },
    };
  }
  return { recover, start };
}

/** Resolve only SDK-generated names relative to the CURRENT app cache root. */
export function sdkExportName(uri: string, cacheUri: string) {
  const prefix = `${cacheUri.replace(/\/$/, "")}/ImageManipulator/`;
  if (!uri.startsWith(prefix)) return null;
  const name = uri.slice(prefix.length);
  return sdkPattern.test(name) ? name : null;
}
