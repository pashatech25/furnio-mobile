import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { config } from "../config";
import { createSubmissionJournal } from "./submission-journal";

const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
// Real submission safety requires native persistent storage, not a browser preview fallback.
function requireNative() {
  if (Platform.OS !== "ios" && Platform.OS !== "android")
    throw new Error("Use the native Furnio app to submit photos.");
}
export const submissionJournal = createSubmissionJournal({
  getItem: async (key) => {
    requireNative();
    return SecureStore.getItemAsync(key, options);
  },
  setItem: async (key, value) => {
    requireNative();
    await SecureStore.setItemAsync(key, value, options);
  },
  removeItem: async (key) => {
    requireNative();
    await SecureStore.deleteItemAsync(key, options);
  },
});
export const submissionScope = () =>
  Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify([config.mode, config.platform, config.supabase]),
  );
