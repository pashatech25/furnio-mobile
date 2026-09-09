import { createClient, type Session, type User } from "@supabase/supabase-js";
import * as Apple from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { z } from "zod";
import { config, demo } from "../config";
import { supabase } from "./client";
import {
  registerDeletionCallback,
  validateDeletionCallback,
} from "./deletion-callback";
import {
  createDeletionReauthentication,
  type DeletionIdentity,
  type DeletionSignInMethod,
  type IsolatedDeletionSignIn,
} from "./deletion-reauthentication";

const tokenMetadata = z.object({
  session_id: z.uuid(),
  sub: z.uuid(),
  exp: z.number().int(),
  aal: z.enum(["aal1", "aal2"]),
});
function metadata(session: Session) {
  try {
    // Used only to bind this local operation. getUser(token) verifies identity;
    // the Worker verifies the actual signed token and live Auth session again.
    const part = session.access_token.split(".")[1]!;
    return tokenMetadata.parse(
      JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))),
    );
  } catch {
    throw new Error(
      "This sign-in cannot be used for a private account review.",
    );
  }
}
function identity(user: User, session: Session): DeletionIdentity {
  const claims = metadata(session);
  if (
    user.id !== claims.sub ||
    user.is_anonymous ||
    claims.exp * 1000 <= Date.now()
  )
    throw new Error(
      "Sign in to your Furnio account before opening a private review.",
    );
  const providers = new Set(
    user.identities?.map((value) => value.provider) ?? [],
  );
  const methods: DeletionSignInMethod[] = [];
  if (providers.has("email") && user.email) methods.push("password");
  if (providers.has("google")) methods.push("google");
  if (providers.has("apple") && Platform.OS === "ios") methods.push("apple");
  return {
    id: user.id,
    sessionId: claims.session_id,
    email: user.email ?? null,
    methods,
  };
}
async function currentIdentity() {
  if (!supabase || Platform.OS === "web")
    throw new Error("Private account review requires a configured native app.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session)
    throw new Error("Sign in to your Furnio account first.");
  const checked = await supabase.auth.getUser(data.session.access_token);
  if (checked.error || !checked.data.user)
    throw new Error("Your sign-in could not be verified. Sign in again.");
  const result = identity(checked.data.user, data.session);
  const latest = await supabase.auth.getSession();
  if (
    !latest.data.session ||
    metadata(latest.data.session).session_id !== result.sessionId
  )
    throw new Error("Your sign-in changed. Start the account review again.");
  return result;
}
function isolated(): IsolatedDeletionSignIn {
  const client = createClient(config.supabase, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
      storageKey: `furnio-private-${Crypto.randomUUID()}`,
    },
  });
  let disposed = false;
  let unregister: (() => void) | null = null;
  async function dispose() {
    disposed = true;
    unregister?.();
    unregister = null;
    // Never use global scope, nor the main application client. If offline, this
    // is best-effort; no temporary credentials are ever saved to device storage.
    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      /* no secret-bearing logs */
    }
    try {
      await client.auth.stopAutoRefresh();
    } catch {
      /* Cleanup must not surface a secret-bearing SDK exception on unmount. */
    }
  }
  return {
    async signIn(method, email, password) {
      if (disposed) throw new Error("Start verification again.");
      if (method === "password") {
        const result = await client.auth.signInWithPassword({
          email: email!,
          password: password!,
        });
        if (result.error)
          throw new Error(
            "Password verification failed. Check your password and try again.",
          );
      } else if (method === "apple") {
        const nonce = Crypto.randomUUID();
        const credential = await Apple.signInAsync({
          requestedScopes: [Apple.AppleAuthenticationScope.EMAIL],
          nonce: await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            nonce,
          ),
        });
        if (disposed || !credential.identityToken)
          throw new Error("Apple verification was not completed.");
        const result = await client.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
          nonce,
        });
        if (result.error)
          throw new Error(
            "Apple verification failed. Use the Apple account already linked to Furnio.",
          );
      } else {
        const flow = Crypto.randomUUID();
        const redirectTo = Linking.createURL("auth/deletion-callback", {
          queryParams: { flow },
        });
        let exchange: Promise<void> | null = null;
        let receivedCode: string | null = null;
        const finish = (raw: string) => {
          const parsed = validateDeletionCallback(raw, redirectTo);
          if (disposed) throw new Error("Verification expired. Start again.");
          if (receivedCode && receivedCode !== parsed.code)
            throw new Error("Invalid verification callback.");
          receivedCode = parsed.code;
          exchange ??= (async () => {
            const result = await client.auth.exchangeCodeForSession(
              parsed.code,
              parsed.flowId ? { flowId: parsed.flowId } : undefined,
            );
            if (result.error)
              throw new Error(
                "Google verification failed. Return and try again.",
              );
            if (disposed) {
              await dispose();
              throw new Error("Verification expired. Start again.");
            }
          })();
          return exchange;
        };
        unregister = registerDeletionCallback(flow, finish);
        try {
          const result = await client.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo,
              skipBrowserRedirect: true,
              queryParams: {
                prompt: "select_account",
                ...(email ? { login_hint: email } : {}),
              },
            },
          });
          if (result.error || !result.data.url || disposed)
            throw new Error("Google verification could not start.");
          const browser = await WebBrowser.openAuthSessionAsync(
            result.data.url,
            redirectTo,
          );
          if (browser.type === "success") await finish(browser.url);
          else if (exchange) await exchange;
          else
            throw new Error(
              "Verification cancelled. Your account has not been changed.",
            );
        } finally {
          unregister?.();
          unregister = null;
        }
      }
      if (disposed) {
        await dispose();
        throw new Error("Verification expired. Start again.");
      }
    },
    async verify() {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session || disposed)
        throw new Error("Complete verification again.");
      const checked = await client.auth.getUser(data.session.access_token);
      if (checked.error || !checked.data.user)
        throw new Error("The verification session could not be checked.");
      const account = identity(checked.data.user, data.session),
        claims = metadata(data.session);
      const verifiedFactors = (checked.data.user.factors ?? []).filter(
        (factor) => factor.status === "verified",
      );
      return {
        id: account.id,
        sessionId: account.sessionId,
        accessToken: data.session.access_token,
        expiresAt: claims.exp * 1000,
        requiresMfa: verifiedFactors.length > 0 && claims.aal !== "aal2",
        factors: verifiedFactors.flatMap((factor) =>
          factor.factor_type === "totp" || factor.factor_type === "phone"
            ? [{ id: factor.id, kind: factor.factor_type }]
            : [],
        ),
      };
    },
    async challenge(factor) {
      if (disposed) throw new Error("Verification expired.");
      const result =
        factor.kind === "phone"
          ? await client.auth.mfa.challenge({
              factorId: factor.id,
              channel: "sms",
            })
          : await client.auth.mfa.challenge({ factorId: factor.id });
      if (result.error)
        throw new Error(
          "The verification code could not be requested. Please wait and try again.",
        );
      return result.data.id;
    },
    async verifyCode(factor, challengeId, code) {
      if (disposed) throw new Error("Verification expired.");
      const result = await client.auth.mfa.verify({
        factorId: factor.id,
        challengeId,
        code,
      });
      if (result.error)
        throw new Error(
          "The verification code was not accepted. Please try again.",
        );
    },
    dispose,
  };
}
export function createNativeDeletionReauthentication(userId: string) {
  if (demo) throw new Error("Sample reviews do not use real credentials.");
  return createDeletionReauthentication({
    expectedUserId: userId,
    currentIdentity,
    createIsolated: isolated,
    now: Date.now,
  });
}
