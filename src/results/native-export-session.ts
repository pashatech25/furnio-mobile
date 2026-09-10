import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import {
  createExportSession,
  type ExportTemporaryFile,
  type OwnExportFile,
} from "./export-session";
import {
  createExportRecovery,
  EXPORT_ROOT,
  ExportRecoveryError,
  sdkExportName,
  type ExportKind,
  type RecoveryReport,
} from "./export-recovery";

const root = () => new Directory(Paths.cache, EXPORT_ROOT);
const folder = (id: string) => new Directory(root(), id);
const remove = (file: File) => {
  if (file.exists) file.delete();
  if (file.exists) throw new ExportRecoveryError();
};
const manager = createExportRecovery(
  {
    sessions: () =>
      root().exists
        ? root()
            .list()
            .map((entry) => ({
              name: entry.name,
              kind: entry instanceof Directory ? "directory" : "file",
            }))
        : [],
    entries: (id) =>
      folder(id).exists
        ? folder(id)
            .list()
            .map((entry) => ({
              name: entry.name,
              kind: entry instanceof Directory ? "directory" : "file",
            }))
        : [],
    createSession: (id) => folder(id).create({ intermediates: true }),
    exists: (id, name) => new File(folder(id), name).exists,
    marker: (id, name) => new File(folder(id), name).create(),
    removeFile: (id, name) => remove(new File(folder(id), name)),
    removeSdkFile: (name) =>
      remove(new File(Paths.cache, "ImageManipulator", name)),
    removeEmptySession: (id) => {
      const directory = folder(id);
      if (!directory.exists) return;
      if (directory.list().length) throw new ExportRecoveryError();
      directory.delete();
      if (directory.exists) throw new ExportRecoveryError();
    },
  },
  Crypto.randomUUID,
  Date.now,
);

const listeners = new Set<() => void>();
let report: RecoveryReport = { failed: 0, retainedShares: 0 };
function publish(next: RecoveryReport) {
  if (
    next.failed === report.failed &&
    next.retainedShares === report.retainedShares
  )
    return;
  report = next;
  for (const listener of listeners) listener();
}
function storage<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    throw new ExportRecoveryError();
  }
}
export const exportRecoverySnapshot = () => report;
export function subscribeExportRecovery(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function recoverNativeExports() {
  if (Platform.OS !== "web") publish(manager.recover());
  return report;
}

export function createNativeExportSession() {
  const session = createExportSession();
  let lease: ReturnType<typeof manager.start> | null = null;
  return {
    get active() {
      return session.active;
    },
    get pending() {
      return session.pending + report.failed;
    },
    cleanup() {
      const pending = session.cleanup();
      if (!session.active) recoverNativeExports();
      return pending + report.failed;
    },
    allocate(kind: ExportKind) {
      if (!lease || !session.active) throw new ExportRecoveryError();
      const current = lease;
      return storage(
        () => new File(folder(current.session), current.allocate(kind)),
      );
    },
    beginShare() {
      if (!lease || !session.active) throw new ExportRecoveryError();
      const current = lease;
      return storage(() => current.beginShare());
    },
    async run(work: (own: OwnExportFile) => Promise<void>) {
      // Per-invocation ownership: a duplicate run must not end the original run.
      let current: ReturnType<typeof manager.start> | undefined;
      try {
        return await session.run(async (own) => {
          const started = storage(() => manager.start());
          current = started;
          lease = started;
          const tracked: OwnExportFile = <T extends ExportTemporaryFile>(
            file: T,
          ) => {
            const uri =
              "uri" in file && typeof file.uri === "string" ? file.uri : "";
            const sdk = sdkExportName(uri, Paths.cache.uri);
            const prefix = folder(started.session).uri.replace(/\/$/, "") + "/";
            if (
              !sdk &&
              !(
                uri.startsWith(prefix) && started.owns(uri.slice(prefix.length))
              )
            )
              throw new ExportRecoveryError();
            const value = own(file); // retain in-memory cleanup even if the marker write fails
            if (sdk) storage(() => started.rememberSdk(sdk));
            return value;
          };
          await work(tracked);
        });
      } catch (error) {
        if (error instanceof ExportRecoveryError) {
          recoverNativeExports();
          throw new ExportRecoveryError();
        }
        throw error;
      } finally {
        // Base session has now drained its handles. Reconcile durable ownership
        // afterwards, including partially written allocated files without handles.
        if (current) {
          publish(current.finish());
          if (lease === current) lease = null;
        }
      }
    },
  };
}
