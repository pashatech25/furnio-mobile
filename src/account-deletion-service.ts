import * as Crypto from "expo-crypto";
import { fetch as nativeFetch } from "expo/fetch";
import { z } from "zod";
import { config, demo } from "./config";
import { capabilitiesSchema } from "./api/schemas";
import { accountDeletionReviewSchema } from "./account-deletion-contract";
import { createDeletionJournal } from "./account-deletion-journal";
import { createDeletionTransport } from "./account-deletion-transport";
import { createDeletionStorage } from "./auth/deletion-storage";
import { createNativeDeletionReauthentication } from "./auth/deletion-client";

export async function openAccountDeletionService(userId: string | null) {
  if (demo)
    throw new Error("Sample reviews cannot call the live account service.");
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${config.supabase}|${config.mobile}`,
  );
  const namespace = `${config.mode}_${hash.slice(0, 32)}`;
  const storage = createDeletionStorage(namespace);
  // Never show the previous owner's receipt while a different account is signed
  // in. Signed-out recovery exposes only a capability-scoped minimal status.
  const receiptOwner = userId ?? (await storage.lastUser());
  const verification = userId
    ? createNativeDeletionReauthentication(userId)
    : null;
  const request = createDeletionTransport(config.mobile, (url, init) =>
    nativeFetch(url, init),
  );
  const journal = createDeletionJournal({
    storage,
    namespace,
    uuid: Crypto.randomUUID,
    secret: async () =>
      Array.from(await Crypto.getRandomBytesAsync(32), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    now: Date.now,
    send: async (action, input, owner) => {
      if (action !== "status" && !verification)
        throw new Error("Sign in to this account before reviewing a request.");
      return request(
        action,
        z.unknown(),
        action === "status" ? null : await verification!.token(owner),
        input,
      );
    },
  });
  return {
    verification,
    journal,
    receiptOwner,
    capabilities: () => request("capabilities", capabilitiesSchema, null),
    review: async () => {
      if (!verification || !userId)
        throw new Error("Sign in to review your shared account.");
      return request(
        "review",
        accountDeletionReviewSchema,
        await verification.token(userId),
      );
    },
    dispose: async () => {
      await verification?.dispose();
    },
  };
}
export type AccountDeletionService = Awaited<
  ReturnType<typeof openAccountDeletionService>
>;
