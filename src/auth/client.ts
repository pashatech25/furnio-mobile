import "react-native-url-polyfill/auto";
import { createClient, processLock } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as Apple from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { config, demo } from "../config";
import { secureStorage } from "./secure-storage";

export const supabase = demo
  ? null
  : createClient(config.supabase, config.key, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        lock: processLock,
      },
    });
WebBrowser.maybeCompleteAuthSession();
export const callbackUrl = (recovery = false) =>
  Linking.createURL(
    "auth/callback",
    recovery ? { queryParams: { type: "recovery" } } : undefined,
  );
const exchanges = new Map<string, Promise<void>>();
export function exchangeCallback(code: string): Promise<void> {
  const existing = exchanges.get(code);
  if (existing) return existing;
  const pending = (async () => {
    if (!supabase) throw new Error("Authentication is not configured.");
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  })();
  exchanges.set(code, pending);
  // The browser session and deep-link route can receive the same one-time PKCE code.
  setTimeout(() => exchanges.delete(code), 60_000);
  return pending;
}
export async function googleSignIn() {
  if (!supabase)
    throw new Error("Google sign-in needs a configured staging build.");
  const redirectTo = callbackUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === "success") {
    const url = new URL(result.url);
    const expected = new URL(redirectTo);
    if (
      url.protocol !== expected.protocol ||
      url.host !== expected.host ||
      url.pathname !== expected.pathname
    )
      throw new Error("Invalid authentication callback.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Sign-in was not completed.");
    await exchangeCallback(code);
  }
}
export async function appleSignIn() {
  if (!supabase)
    throw new Error("Apple sign-in needs a configured iOS development build.");
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    nonce,
  );
  const credential = await Apple.signInAsync({
    requestedScopes: [
      Apple.AppleAuthenticationScope.EMAIL,
      Apple.AppleAuthenticationScope.FULL_NAME,
    ],
    nonce: hashed,
  });
  if (!credential.identityToken)
    throw new Error("Apple did not return a verified identity.");
  const result = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce,
  });
  if (result.error) throw result.error;
}
