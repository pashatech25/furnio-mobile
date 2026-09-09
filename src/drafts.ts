import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { secureStorage } from "./auth/secure-storage";
import { config } from "./config";
import { serviceIds, type ServiceId } from "./service-ids";
import { createDraftStore, type DraftMedia } from "./draft-store";
import { createDraftStorage } from "./draft-storage";
import type { DraftInput } from "./draft-schema";
export type { Draft } from "./draft-schema";

export function cacheSource(uri: string, cacheUri: string) {
  if (
    !cacheUri.endsWith("/") ||
    !uri.startsWith(cacheUri) ||
    /[?#\\]/.test(uri)
  )
    return false;
  try {
    const tail = decodeURIComponent(uri.slice(cacheUri.length));
    return (
      !!tail &&
      !/[?#\\\0]/.test(tail) &&
      !tail.split("/").some((part) => !part || part === "." || part === "..")
    );
  } catch {
    return false;
  }
}
export function nativeDraftMedia(scope: string): DraftMedia {
  if (!/^[a-f0-9]{64}$/.test(scope))
    throw new Error("Invalid draft cache scope.");
  const folder = (user: string, service: ServiceId) =>
    new Directory(
      Paths.cache,
      "furnio-drafts-v2",
      scope,
      z.uuid().parse(user),
      z.enum(serviceIds).parse(service),
    );
  const generationFolder = (
    user: string,
    service: ServiceId,
    generation: string,
  ) => new Directory(folder(user, service), z.uuid().parse(generation));
  return {
    copy: async (user, service, generation, photos) => {
      const dir = generationFolder(user, service, generation);
      for (const photo of photos) {
        if (
          !cacheSource(photo.uri, Paths.cache.uri) ||
          !new File(photo.uri).exists
        )
          throw new Error(
            "One of the draft files is unavailable. Choose that photo again.",
          );
        const protectedRoot =
          new Directory(Paths.cache, "furnio-drafts-v2").uri.replace(
            /\/$/,
            "",
          ) + "/";
        const decoded = decodeURIComponent(photo.uri);
        if (
          decoded.startsWith(decodeURIComponent(protectedRoot)) &&
          !decoded.startsWith(
            decodeURIComponent(
              folder(user, service).uri.replace(/\/$/, "") + "/",
            ),
          )
        )
          throw new Error(
            "This draft photo belongs to another account or service.",
          );
      }
      dir.create({ intermediates: true });
      return photos.map((photo, index) => {
        const destination = new File(
          dir,
          `${index}.${photo.contentType === "application/pdf" ? "pdf" : "jpg"}`,
        );
        new File(photo.uri).copy(destination);
        return { ...photo, uri: destination.uri };
      });
    },
    exists: (user, service, generation, uri) => {
      const prefix =
        generationFolder(user, service, generation).uri.replace(/\/$/, "") +
        "/";
      return (
        uri.startsWith(prefix) &&
        /^[0-8]\.(jpg|pdf)$/.test(uri.slice(prefix.length)) &&
        new File(uri).exists
      );
    },
    clear: async (user, service, keep) => {
      const dir = folder(user, service);
      if (!dir.exists) return;
      if (!keep) {
        dir.delete();
        return;
      }
      z.uuid().parse(keep);
      const children = dir.list();
      for (const child of children) {
        if (
          !(child instanceof Directory) ||
          !z.uuid().safeParse(child.name).success ||
          child.parentDirectory.uri !== dir.uri
        )
          throw new Error("Draft cache cleanup needs attention.");
      }
      for (const child of children) if (child.name !== keep) child.delete();
    },
  };
}
let instance: Promise<ReturnType<typeof createDraftStore>> | undefined;
const store = () =>
  (instance ??= (async () => {
    const scope = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      JSON.stringify([config.mode, config.supabase, config.platform]),
    );
    return createDraftStore({
      namespace: `furnio.drafts-v2.${scope}`,
      storage: createDraftStorage({
        get: SecureStore.getItemAsync,
        set: (key, value) =>
          SecureStore.setItemAsync(key, value, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          }),
        remove: SecureStore.deleteItemAsync,
        uuid: Crypto.randomUUID,
      }),
      media: nativeDraftMedia(scope),
      now: Date.now,
      uuid: Crypto.randomUUID,
      clearLegacyDraft: (user, service) =>
        secureStorage.removeItem(`furnio.draft-v1.${user}.${service}`),
      clearLegacyPreferences: async (user) => {
        for (const service of serviceIds)
          await AsyncStorage.removeItem(`furnio.draft.${user}.${service}`);
      },
    });
  })());
export async function setDraftOwner(user: string | null) {
  if (Platform.OS === "web") return;
  await (await store()).setOwner(user);
}
export async function saveDraft(
  user: string,
  service: ServiceId,
  input: DraftInput,
) {
  if (Platform.OS === "web")
    throw new Error(
      "Persistent photo drafts are native-only. Browser previews do not store your photos.",
    );
  return (await store()).save(user, service, input);
}
export async function loadDraft(user: string, service: ServiceId) {
  if (Platform.OS === "web") return null;
  return (await store()).load(user, service);
}
export async function discardDraft(user: string, service: ServiceId) {
  if (Platform.OS === "web") return;
  await (await store()).discard(user, service);
}
