// Only pass handles created for this export. Never register a Photos/Files
// original, a saved draft, a remote path, or an entire cache directory.
export type ExportTemporaryFile = {
  readonly exists: boolean;
  delete: () => void;
};
export type OwnExportFile = <T extends ExportTemporaryFile>(file: T) => T;

export class ExportCleanupPendingError extends Error {
  constructor() {
    super(
      "Temporary export copies could not be cleared. Retry cleanup before exporting another photo.",
    );
  }
}

export function createExportSession() {
  const pending = new Set<ExportTemporaryFile>();
  let active = false;
  const drain = () => {
    for (const file of pending) {
      try {
        if (file.exists) file.delete();
        // Some adapters can silently leave a file behind. Retain it for retry.
        if (!file.exists) pending.delete(file);
      } catch {
        // Do not skip other copies, replace the primary export error, expose
        // file paths, or leave the screen's busy state stuck.
      }
    }
    return pending.size;
  };
  const own: OwnExportFile = (file) => {
    if (!active) throw new Error("There is no active photo export.");
    pending.add(file);
    return file;
  };
  return {
    get active() {
      return active;
    },
    get pending() {
      return pending.size;
    },
    cleanup: () => (active ? pending.size : drain()),
    async run(work: (own: OwnExportFile) => Promise<void>): Promise<boolean> {
      if (active) return false;
      if (drain()) throw new ExportCleanupPendingError();
      active = true;
      try {
        await work(own);
        return true;
      } finally {
        active = false;
        drain();
      }
    },
  };
}
