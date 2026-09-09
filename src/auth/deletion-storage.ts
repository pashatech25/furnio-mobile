import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { z } from "zod";

export function createDeletionStorage(namespace: string) {
  if (!/^[a-z0-9_-]{3,80}$/.test(namespace))
    throw new Error("Invalid private storage environment.");
  const bookmark = `furnio-deletion-last-${namespace}`;
  const prefix = `furnio-deletion-${namespace}-`;
  function native() {
    if (Platform.OS !== "ios" && Platform.OS !== "android")
      throw new Error(
        "Account request receipts require secure native device storage.",
      );
  }
  function owner(key: string) {
    const id = key.startsWith(prefix) ? key.slice(prefix.length) : "";
    if (!z.uuid().safeParse(id).success)
      throw new Error("Invalid account receipt storage key.");
    return id;
  }
  return {
    async lastUser() {
      native();
      const id = await SecureStore.getItemAsync(bookmark);
      if (id === null) return null;
      if (!z.uuid().safeParse(id).success)
        throw new Error(
          "The saved account receipt needs support recovery. It has not been replaced.",
        );
      return id;
    },
    async getItem(key: string) {
      native();
      owner(key);
      // Intentionally NOT the auth chunk-store: a corrupt manifest there can
      // return null. A corrupt deletion capability must never be silently reset.
      return SecureStore.getItemAsync(key);
    },
    async setItem(key: string, value: string) {
      native();
      const id = owner(key);
      if (new TextEncoder().encode(value).byteLength > 2000)
        throw new Error(
          "The account receipt exceeds its secure storage limit.",
        );
      const options = {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      };
      await SecureStore.setItemAsync(key, value, options);
      // Both must succeed BEFORE a mutation is sent. If bookmarking fails, the
      // original capability remains recoverable under this account's exact ID.
      await SecureStore.setItemAsync(bookmark, id, options);
    },
  };
}
