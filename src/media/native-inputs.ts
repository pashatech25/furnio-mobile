import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { OperationStopped } from "../auth/operation-scope";
import {
  createInputRecovery,
  INPUT_ROOT,
  InputCleanupError,
  inputSdkFile,
  type InputSdk,
} from "./input-recovery";

const sdkDirectories: Record<InputSdk, string> = {
  picker: "ImagePicker",
  "picker-root": "",
  document: "DocumentPicker",
  manipulator: "ImageManipulator",
};
const root = () => new Directory(Paths.cache, INPUT_ROOT);
const folder = (id: string) => new Directory(root(), id);
const remove = (file: File) => {
  if (file.exists) file.delete();
  if (file.exists) throw new InputCleanupError();
};
const entries = (dir: Directory) =>
  dir.exists
    ? dir.list().map((file) => ({
        name: file.name,
        kind:
          file instanceof Directory
            ? ("directory" as const)
            : ("file" as const),
      }))
    : [];
const manager = createInputRecovery(
  {
    sessions: () => entries(root()),
    entries: (id) => entries(folder(id)),
    create: (id) => folder(id).create({ intermediates: true }),
    exists: (id, name) => new File(folder(id), name).exists,
    marker: (id, name) => new File(folder(id), name).create(),
    remove: (id, name) => remove(new File(folder(id), name)),
    removeSdk: (kind, name) =>
      remove(new File(Paths.cache, sdkDirectories[kind], name)),
    removeEmpty: (id) => {
      const dir = folder(id);
      if (!dir.exists) return;
      if (dir.list().length) throw new InputCleanupError();
      dir.delete();
      if (dir.exists) throw new InputCleanupError();
    },
  },
  Crypto.randomUUID,
);
let report = { failed: 0 };
const listeners = new Set<() => void>();
const publish = (next: typeof report) => {
  if (next.failed !== report.failed) {
    report = next;
    for (const listener of listeners) listener();
  }
};
export const inputRecoverySnapshot = () => report;
export function subscribeInputRecovery(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function recoverNativeInputs() {
  if (Platform.OS !== "web") publish(manager.recover());
  return report;
}
export type InputTransaction = {
  assertCurrent(): void;
  rememberSdk(
    uri: string,
    source: "picker" | "document" | "manipulator",
  ): () => void;
  copy(uri: string, extension: "jpg" | "pdf"): Promise<string>;
};

/** Screen/session lifetime, separate from saved drafts and result sharing. */
export function createNativeInputOwner(
  signal: AbortSignal,
  assertCurrent: () => void,
) {
  let closed = signal.aborted,
    busy = false;
  const retained = new Set<ReturnType<typeof manager.start>>();
  const check = () => {
    if (closed || signal.aborted) throw new OperationStopped();
    assertCurrent();
  };
  const close = () => {
    closed = true;
    signal.removeEventListener("abort", close);
    for (const lease of retained) {
      publish(lease.finish());
      retained.delete(lease);
    }
  };
  signal.addEventListener("abort", close, { once: true });
  return {
    close,
    async run<T>(
      work: (transaction: InputTransaction) => Promise<T>,
    ): Promise<T> {
      check();
      if (busy) throw new Error("Finish the current file selection first.");
      busy = true;
      let lease: ReturnType<typeof manager.start> | undefined;
      let keep = false;
      try {
        if (Platform.OS !== "web") lease = manager.start();
        const transaction: InputTransaction = {
          assertCurrent: check,
          rememberSdk(uri, source) {
            if (!lease) return () => {};
            // Deliberately register returned files BEFORE checking cancellation.
            const sdk = inputSdkFile(uri, Paths.cache.uri, source, Platform.OS);
            if (!sdk)
              throw new Error(
                "The selected file has an unsupported temporary location. Your original was not changed.",
              );
            return lease.rememberSdk(sdk.kind, sdk.name);
          },
          async copy(uri, extension) {
            check();
            if (!lease) return uri;
            try {
              const file = new File(
                folder(lease.id),
                lease.allocate(extension),
              );
              await new File(uri).copy(file);
              check();
              if (!file.exists) throw new InputCleanupError();
              return file.uri;
            } catch {
              throw new InputCleanupError();
            }
          },
        };
        const result = await work(transaction);
        check();
        if (lease) {
          if (entries(folder(lease.id)).length) retained.add(lease);
          else publish(lease.finish());
        }
        keep = true;
        return result;
      } finally {
        busy = false;
        if (lease && !keep) publish(lease.finish());
        else recoverNativeInputs();
      }
    },
  };
}
