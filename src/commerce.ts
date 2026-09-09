import { Platform } from "react-native";
import Purchases, {
  PRODUCT_CATEGORY,
  type PurchasesStoreProduct,
} from "react-native-purchases";
import { z } from "zod";
import * as Crypto from "expo-crypto";
import { demo } from "./config";
import { supabase } from "./auth/client";
import { mobileApi } from "./state";
import { capabilitiesSchema } from "./api/schemas";
import {
  storePurchaseObservation,
  unresolvedPurchaseStatus,
} from "./store-purchase-outcome";
import {
  clearPurchaseJournal,
  readPurchaseJournal,
  savePurchaseJournal,
  type PurchaseJournal,
} from "./purchase-journal";

export const purchasesEnabled =
  !demo &&
  Platform.OS !== "web" &&
  process.env.EXPO_PUBLIC_PURCHASES_ENABLED === "true";
export const restorationAvailable = !demo && Platform.OS !== "web";
export const recoveryResultSchema = z.object({
  status: z.enum([
    "synchronized",
    "pending",
    "needs_review",
    "not_started",
    "no_purchases_found",
    "verified",
    "selection_cleared",
  ]),
  checkedAt: z.string().nullable().optional(),
});
let operation: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = operation.then(run, run);
  operation = next.catch(() => undefined);
  return next;
}
async function requireUser(userId: string, recovery = false) {
  if (recovery ? !restorationAvailable : !purchasesEnabled)
    throw new Error("Store purchases are not enabled in this build.");
  await requireCurrentUser(userId);
  const gate = await mobileApi("/v1/capabilities", capabilitiesSchema);
  if (recovery ? !gate.recoveryReady : !gate.commerceReady)
    throw new Error(
      "Purchasing is temporarily unavailable. Existing credits remain safe.",
    );
  await requireCurrentUser(userId);
}
async function requireCurrentUser(userId: string) {
  const current = (await supabase?.auth.getSession())?.data.session?.user.id;
  if (!current || current !== userId)
    throw new Error("Your account changed. Reopen Credits before purchasing.");
}
async function identify(userId: string, recovery = false) {
  await requireUser(userId, recovery);
  const key =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  if (
    !key ||
    !(
      (Platform.OS === "ios" && key.startsWith("appl_")) ||
      (Platform.OS === "android" && key.startsWith("goog_"))
    )
  )
    throw new Error(
      "A platform-specific public RevenueCat SDK key is required.",
    );
  if (!(await Purchases.isConfigured()))
    Purchases.configure({
      apiKey: key,
      appUserID: userId,
      shouldShowInAppMessagesAutomatically: false,
    });
  else if ((await Purchases.getAppUserID()) !== userId)
    await Purchases.logIn(userId);
  // Never configure anonymously or use an email address as purchase identity.
  if ((await Purchases.getAppUserID()) !== userId)
    throw new Error("Store identity could not be verified.");
}
export function loadStoreProducts(
  userId: string,
  ids: { productId: string; interval: "month" | "one_time" }[],
) {
  return serial(async () => {
    await identify(userId);
    const monthly = ids
      .filter((item) => item.interval === "month")
      .map((item) => item.productId);
    const packs = ids
      .filter((item) => item.interval === "one_time")
      .map((item) => item.productId);
    const products = [
      ...(monthly.length
        ? await Purchases.getProducts(monthly, PRODUCT_CATEGORY.SUBSCRIPTION)
        : []),
      ...(packs.length
        ? await Purchases.getProducts(packs, PRODUCT_CATEGORY.NON_SUBSCRIPTION)
        : []),
    ];
    await requireUser(userId);
    return products;
  });
}
const intentResult = z.object({
  intentId: z.uuid(),
  status: z.enum(["reserved", "pending", "verified", "cancelled", "expired"]),
});
async function recoverIntent(userId: string, journal: PurchaseJournal) {
  await requireCurrentUser(userId);
  if (!journal.intentId) return { status: "not_started" as const };
  let result = await mobileApi(
    `/v1/purchases/intents/${journal.intentId}`,
    intentResult,
    journal.transactionId
      ? { action: "report", transactionId: journal.transactionId }
      : journal.observation === "cancelled"
        ? { action: "store_cancelled" }
        : undefined,
  );
  if (result.intentId !== journal.intentId)
    throw new Error("Purchase recovery reference changed. Contact support.");
  if (result.status === "reserved")
    result = await mobileApi(
      `/v1/purchases/intents/${journal.intentId}`,
      intentResult,
      { action: "cancel" },
    );
  await requireCurrentUser(userId);
  if (result.intentId !== journal.intentId)
    throw new Error("Purchase recovery reference changed. Contact support.");
  if (["verified", "cancelled", "expired"].includes(result.status))
    await clearPurchaseJournal(userId);
  return {
    status:
      result.status === "verified"
        ? ("verified" as const)
        : ["cancelled", "expired"].includes(result.status)
          ? ("selection_cleared" as const)
          : journal.transactionId
            ? ("pending" as const)
            : unresolvedPurchaseStatus(journal.observation),
  };
}
export function purchase(userId: string, product: PurchasesStoreProduct) {
  return serial(async () => {
    await identify(userId);
    let journal = await readPurchaseJournal(userId);
    if (journal?.phase === "launched") return recoverIntent(userId, journal);
    if (journal && journal.productId !== product.identifier)
      throw new Error(
        "An earlier purchase selection is pending. Check purchase recovery before changing products.",
      );
    journal ??= {
      requestId: Crypto.randomUUID(),
      intentId: null,
      productId: product.identifier,
      phase: "preparing",
    };
    // Persist BEFORE the reservation request, so an interrupted response reuses
    // its request ID instead of reserving/charging again.
    await savePurchaseJournal(userId, journal);
    const eligibility = await mobileApi(
      "/v1/purchases/eligibility",
      z.union([
        z.object({
          allowed: z.literal(true),
          intentId: z.uuid(),
          expiresAt: z.string(),
        }),
        z.object({
          allowed: z.literal(false),
          reason: z.enum([
            "existing_subscription",
            "purchase_pending",
            "request_already_used",
          ]),
        }),
      ]),
      {
        productId: product.identifier,
        store: Platform.OS === "ios" ? "APP_STORE" : "PLAY_STORE",
        requestId: journal.requestId,
      },
    );
    if (!eligibility.allowed) {
      if (eligibility.reason === "existing_subscription")
        await clearPurchaseJournal(userId);
      throw new Error(
        eligibility.reason === "existing_subscription"
          ? "You already have a subscription. Manage it with its existing payment provider."
          : "A purchase is already pending. Check purchase recovery or contact support; do not buy again.",
      );
    }
    journal = { ...journal, intentId: eligibility.intentId, phase: "launched" };
    // Commit an irreversible local marker before asking the server to launch.
    // A lost launch response must NEVER reopen the store sheet automatically.
    await savePurchaseJournal(userId, journal);
    await requireUser(userId);
    const launch = await mobileApi(
      `/v1/purchases/intents/${journal.intentId}`,
      intentResult,
      {
        action: "launch",
        store: Platform.OS === "ios" ? "APP_STORE" : "PLAY_STORE",
      },
    );
    if (launch.intentId !== journal.intentId || launch.status !== "pending")
      throw new Error(
        "Checkout launch could not be confirmed. Check purchase recovery before trying again.",
      );
    await requireUser(userId);
    const launchedJournal = journal;
    const result = await Purchases.purchaseStoreProduct(product).catch(
      async (error: unknown) => {
        // The store may require approval, report ownership, or have an unknown
        // outcome. Persist only an enum, never raw errors/receipts or credentials.
        const observation = storePurchaseObservation(error);
        await savePurchaseJournal(userId, { ...launchedJournal, observation });
        await requireCurrentUser(userId);
        return { observation };
      },
    );
    if ("observation" in result) {
      // An explicit SDK cancellation can release only the checkout selection,
      // after fresh server checks. Unknown/pending/owned outcomes cannot use it.
      if (result.observation === "cancelled")
        return recoverIntent(userId, {
          ...launchedJournal,
          observation: result.observation,
        });
      return { status: unresolvedPurchaseStatus(result.observation) };
    }
    const transactionId = z
      .string()
      .min(1)
      .max(512)
      .parse(result.transaction.transactionIdentifier);
    journal = { ...journal, transactionId };
    // No receipt, purchase token, raw store JSON, price, balance or credentials.
    await savePurchaseJournal(userId, journal);
    await requireUser(userId, true);
    const delivery = await recoverIntent(userId, journal);
    if (delivery.status === "verified") return delivery;
    await mobileApi("/v1/purchases/reconcile", recoveryResultSchema, {});
    return recoverIntent(userId, journal);
  });
}
export function restore(userId: string) {
  return serial(async () => {
    await identify(userId, true);
    await Purchases.restorePurchases().catch(() => {
      throw new Error(
        "The store history could not be checked. No new payment was opened. Check the signed-in store account and try Restore again when connected.",
      );
    });
    await requireUser(userId, true);
    const recovery = await mobileApi(
      "/v1/purchases/reconcile",
      recoveryResultSchema,
      {},
    );
    await requireCurrentUser(userId);
    const journal = await readPurchaseJournal(userId);
    // An account-wide history scan is not proof that this exact checkout was
    // delivered. Prefer its independently verified status, even after restore.
    if (journal?.intentId) {
      const exact = await recoverIntent(userId, journal);
      if (exact.status === "verified" || exact.status === "selection_cleared")
        return exact;
      if (recovery.status === "needs_review") return recovery;
      return exact;
    }
    return recovery;
  });
}
export function checkRecovery(userId: string) {
  return serial(async () => {
    await requireUser(userId, true);
    const journal = await readPurchaseJournal(userId);
    if (journal?.intentId) {
      const exact = await recoverIntent(userId, journal);
      if (exact.status === "verified" || exact.status === "selection_cleared")
        return exact;
      // This explicit recovery action can enqueue the same bounded/idempotent
      // server scan as Restore, without opening any native purchase sheet.
      const recovery = await mobileApi(
        "/v1/purchases/reconcile",
        recoveryResultSchema,
        {},
      );
      await requireCurrentUser(userId);
      const refreshed = await recoverIntent(userId, journal);
      if (
        refreshed.status === "verified" ||
        refreshed.status === "selection_cleared"
      )
        return refreshed;
      return recovery.status === "needs_review" ? recovery : refreshed;
    }
    if (journal?.phase === "preparing") {
      const selection = await mobileApi(
        "/v1/purchases/recover-selection",
        z.union([
          intentResult,
          z.object({ intentId: z.null(), status: z.literal("not_found") }),
        ]),
        {
          store: Platform.OS === "ios" ? "APP_STORE" : "PLAY_STORE",
          requestId: journal.requestId,
        },
      );
      await requireCurrentUser(userId);
      if (
        selection.status === "not_found" ||
        selection.status === "cancelled" ||
        selection.status === "expired"
      ) {
        await clearPurchaseJournal(userId);
        return { status: "selection_cleared" as const };
      }
      if (!selection.intentId)
        throw new Error("Purchase reference is unavailable. Contact support.");
      const recovered = {
        ...journal,
        intentId: selection.intentId,
        phase: "launched" as const,
      };
      await savePurchaseJournal(userId, recovered);
      return recoverIntent(userId, recovered);
    }
    return mobileApi("/v1/purchases/reconcile", recoveryResultSchema);
  });
}

export function purchaseRecoveryNotice(userId: string) {
  return serial(async () => {
    await requireCurrentUser(userId);
    const journal = await readPurchaseJournal(userId);
    await requireCurrentUser(userId);
    if (!journal) return null;
    return {
      reference: journal.intentId ?? journal.requestId,
      status: journal.transactionId
        ? ("pending" as const)
        : journal.phase === "preparing"
          ? ("selection_pending" as const)
          : unresolvedPurchaseStatus(journal.observation),
    };
  });
}
