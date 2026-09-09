import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recoveryMessage } from "./recovery-message";
import type { PurchasesStoreProduct } from "react-native-purchases";
const current = vi.hoisted(() => ({
  user: "00000000-0000-4000-8000-000000000001",
  commerce: false,
  recovery: true,
  configured: false,
  storeUser: "",
  restored: 0,
}));
const calls = vi.hoisted(() => ({
  api: vi.fn(),
  purchase: vi.fn(),
  restore: vi.fn(),
  journal: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./config", () => ({ config: { mode: "staging" }, demo: false }));
vi.mock("./auth/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: current.user } } },
      }),
    },
  },
}));
vi.mock("./state", () => ({ mobileApi: calls.api }));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "30000000-0000-4000-8000-000000000001",
}));
vi.mock("./purchase-journal", () => ({
  readPurchaseJournal: calls.journal,
  savePurchaseJournal: calls.save,
  clearPurchaseJournal: calls.clear,
}));
vi.mock("react-native-purchases", () => ({
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: "1",
    PAYMENT_PENDING_ERROR: "20",
    PRODUCT_ALREADY_PURCHASED_ERROR: "6",
  },
  PRODUCT_CATEGORY: { SUBSCRIPTION: "subscription", NON_SUBSCRIPTION: "pack" },
  default: {
    isConfigured: async () => current.configured,
    configure: ({ appUserID }: { appUserID: string }) => {
      current.configured = true;
      current.storeUser = appUserID;
    },
    getAppUserID: async () => current.storeUser,
    logIn: async (user: string) => {
      current.storeUser = user;
    },
    restorePurchases: calls.restore,
    purchaseStoreProduct: calls.purchase,
  },
}));
beforeEach(() => {
  vi.stubEnv("EXPO_PUBLIC_PURCHASES_ENABLED", "false");
  vi.stubEnv("EXPO_PUBLIC_REVENUECAT_IOS_KEY", "appl_fixture");
  current.user = "00000000-0000-4000-8000-000000000001";
  current.commerce = false;
  current.recovery = true;
  current.configured = false;
  current.storeUser = "";
  calls.api
    .mockReset()
    .mockImplementation(async (path: string) =>
      path === "/v1/capabilities"
        ? { commerceReady: current.commerce, recoveryReady: current.recovery }
        : { status: "pending" },
    );
  calls.restore.mockReset().mockResolvedValue({});
  calls.purchase.mockReset();
  calls.journal.mockReset().mockResolvedValue(null);
  calls.save.mockReset().mockResolvedValue(undefined);
  calls.clear.mockReset().mockResolvedValue(undefined);
});

describe("one-shot native purchase launch and durable recovery", () => {
  const intentId = "40000000-0000-4000-8000-000000000001";
  const product = { identifier: "pack20" } as PurchasesStoreProduct;
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("EXPO_PUBLIC_PURCHASES_ENABLED", "true");
    current.commerce = true;
    calls.api.mockImplementation(
      async (
        path: string,
        _schema: unknown,
        body?: Record<string, unknown>,
      ) => {
        if (path === "/v1/capabilities")
          return {
            commerceReady: current.commerce,
            recoveryReady: current.recovery,
          };
        if (path === "/v1/purchases/eligibility")
          return { allowed: true, intentId, expiresAt: "2026-09-09T08:00:00Z" };
        if (path.startsWith("/v1/purchases/intents/"))
          return {
            intentId,
            status: body?.action === "report" ? "verified" : "pending",
          };
        return { status: "pending" };
      },
    );
    calls.purchase.mockResolvedValue({
      transaction: {
        transactionIdentifier: "txn_lookup",
        purchaseToken: "must-not-send",
        originalJson: "must-not-send",
      },
    });
    calls.save.mockImplementation(async (_user, journal) => {
      calls.journal.mockResolvedValue(journal);
    });
  });
  it("persists the one-shot marker before launch and reports only the transaction identifier", async () => {
    const { purchase } = await import("./commerce");
    expect(await purchase(current.user, product)).toEqual({
      status: "verified",
    });
    expect(calls.purchase).toHaveBeenCalledOnce();
    const launchIndex = calls.api.mock.calls.findIndex(
      ([, , body]) => body?.action === "launch",
    );
    expect(calls.save.mock.invocationCallOrder[1]).toBeLessThan(
      calls.api.mock.invocationCallOrder[launchIndex]!,
    );
    expect(calls.api).toHaveBeenCalledWith(
      `/v1/purchases/intents/${intentId}`,
      expect.anything(),
      { action: "report", transactionId: "txn_lookup" },
    );
    expect(JSON.stringify(calls.api.mock.calls)).not.toContain("must-not-send");
    expect(calls.clear).toHaveBeenCalledWith(current.user);
  });
  it("does not reopen a pending store sheet after process restart", async () => {
    calls.journal.mockResolvedValue({
      requestId: intentId,
      intentId,
      productId: "pack20",
      phase: "launched",
    });
    const { purchase } = await import("./commerce");
    expect(await purchase(current.user, product)).toEqual({
      status: "interrupted",
    });
    expect(calls.purchase).not.toHaveBeenCalled();
    expect(
      calls.api.mock.calls.some(
        ([path]) => path === "/v1/purchases/eligibility",
      ),
    ).toBe(false);
  });
  it("keeps explicit SDK cancellation protected when the server cannot clear it", async () => {
    calls.purchase.mockRejectedValue({
      code: "1",
      userCancelled: true,
      message: "private store payload",
    });
    const { purchase } = await import("./commerce");
    expect(await purchase(current.user, product)).toEqual({
      status: "cancelled_unresolved",
    });
    expect(calls.save).toHaveBeenLastCalledWith(
      current.user,
      expect.objectContaining({ observation: "cancelled" }),
    );
    expect(JSON.stringify(calls.save.mock.calls)).not.toContain(
      "private store payload",
    );
    expect(calls.clear).not.toHaveBeenCalled();
    expect(await purchase(current.user, product)).toEqual({
      status: "cancelled_unresolved",
    });
    expect(calls.purchase).toHaveBeenCalledOnce();
  });
  it("clears only after the server accepts SDK cancellation and never reopens automatically", async () => {
    const original = calls.api.getMockImplementation()!;
    calls.api.mockImplementation(async (path, schema, body) =>
      body?.action === "store_cancelled"
        ? { intentId, status: "cancelled" }
        : original(path, schema, body),
    );
    calls.purchase.mockRejectedValue({ code: "1" });
    const { purchase } = await import("./commerce");
    expect(await purchase(current.user, product)).toEqual({
      status: "selection_cleared",
    });
    expect(calls.save).toHaveBeenLastCalledWith(
      current.user,
      expect.objectContaining({ observation: "cancelled" }),
    );
    expect(calls.api).toHaveBeenCalledWith(
      `/v1/purchases/intents/${intentId}`,
      expect.anything(),
      { action: "store_cancelled" },
    );
    expect(calls.clear).toHaveBeenCalledWith(current.user);
    expect(calls.purchase).toHaveBeenCalledOnce();
  });
  it.each(["20", "6", "2"])(
    "does not request cancellation release for SDK error %s",
    async (code) => {
      calls.purchase.mockRejectedValue({ code });
      const { purchase } = await import("./commerce");
      await purchase(current.user, product);
      expect(
        calls.api.mock.calls.some(
          ([, , body]) => body?.action === "store_cancelled",
        ),
      ).toBe(false);
      expect(calls.clear).not.toHaveBeenCalled();
    },
  );
  it("retains the cancellation journal when the recovery response is lost", async () => {
    const original = calls.api.getMockImplementation()!;
    calls.api.mockImplementation(async (path, schema, body) => {
      if (body?.action === "store_cancelled") throw new Error("offline");
      return original(path, schema, body);
    });
    calls.purchase.mockRejectedValue({ code: "1" });
    const { purchase } = await import("./commerce");
    await expect(purchase(current.user, product)).rejects.toThrow("offline");
    expect(calls.save).toHaveBeenLastCalledWith(
      current.user,
      expect.objectContaining({ observation: "cancelled" }),
    );
    expect(calls.clear).not.toHaveBeenCalled();
    expect(calls.purchase).toHaveBeenCalledOnce();
  });
  it("requires durable storage before any checkout can launch", async () => {
    calls.save.mockRejectedValue(new Error("keychain unavailable"));
    const { purchase } = await import("./commerce");
    await expect(purchase(current.user, product)).rejects.toThrow("keychain");
    expect(calls.purchase).not.toHaveBeenCalled();
    expect(
      calls.api.mock.calls.some(
        ([path]) => path === "/v1/purchases/eligibility",
      ),
    ).toBe(false);
  });
  it("keeps uncertain launch responses pending without opening payment", async () => {
    calls.api.mockImplementation(
      async (
        path: string,
        _schema: unknown,
        body?: Record<string, unknown>,
      ) => {
        if (path === "/v1/capabilities")
          return { commerceReady: true, recoveryReady: true };
        if (path === "/v1/purchases/eligibility")
          return { allowed: true, intentId, expiresAt: "later" };
        if (body?.action === "launch")
          throw new Error("connection interrupted");
        return { intentId, status: "pending" };
      },
    );
    const { purchase } = await import("./commerce");
    await expect(purchase(current.user, product)).rejects.toThrow(
      "interrupted",
    );
    expect(await purchase(current.user, product)).toEqual({
      status: "interrupted",
    });
    expect(calls.purchase).not.toHaveBeenCalled();
  });
  it("does not report a transaction under the next signed-in account", async () => {
    calls.purchase.mockImplementation(async () => {
      current.user = "00000000-0000-4000-8000-000000000099";
      return { transaction: { transactionIdentifier: "txn_lookup" } };
    });
    const { purchase } = await import("./commerce");
    await expect(purchase(current.user, product)).rejects.toThrow(
      "account changed",
    );
    expect(
      calls.api.mock.calls.some(([, , body]) => body?.action === "report"),
    ).toBe(false);
    expect(calls.clear).not.toHaveBeenCalled();
  });
  it("does not equate a recent-history scan with this payment being verified", async () => {
    calls.api.mockImplementation(async (path: string) => {
      if (path === "/v1/capabilities")
        return { commerceReady: true, recoveryReady: true };
      if (path === "/v1/purchases/eligibility")
        return { allowed: true, intentId, expiresAt: "later" };
      if (path === "/v1/purchases/reconcile") return { status: "synchronized" };
      return { intentId, status: "pending" };
    });
    const { purchase } = await import("./commerce");
    expect(await purchase(current.user, product)).toEqual({
      status: "pending",
    });
    expect(calls.clear).not.toHaveBeenCalled();
  });
  it.each([
    ["20", "awaiting_store"],
    ["6", "store_owned"],
    ["2", "interrupted"],
    ["10", "interrupted"],
  ] as const)(
    "persists and recovers SDK code %s without reopening payment",
    async (code, status) => {
      calls.purchase.mockRejectedValue({ code, message: "must-not-persist" });
      const { purchase } = await import("./commerce");
      expect(await purchase(current.user, product)).toEqual({ status });
      expect(await purchase(current.user, product)).toEqual({ status });
      expect(calls.purchase).toHaveBeenCalledOnce();
      expect(calls.clear).not.toHaveBeenCalled();
      expect(JSON.stringify(calls.api.mock.calls)).not.toContain(
        "must-not-persist",
      );
      expect(JSON.stringify(calls.save.mock.calls)).not.toContain(
        "must-not-persist",
      );
    },
  );
  it("retains the launch marker if recording a store observation fails", async () => {
    calls.purchase.mockRejectedValue({ code: "1" });
    calls.save.mockImplementation(async (_user, journal) => {
      if (journal.observation) throw new Error("keychain unavailable");
      calls.journal.mockResolvedValue(journal);
    });
    const { purchase } = await import("./commerce");
    await expect(purchase(current.user, product)).rejects.toThrow("keychain");
    expect(await purchase(current.user, product)).toEqual({
      status: "interrupted",
    });
    expect(calls.purchase).toHaveBeenCalledOnce();
    expect(calls.clear).not.toHaveBeenCalled();
  });
  it("rejects a mismatched launch permit before opening the SDK sheet", async () => {
    const api = calls.api.getMockImplementation()!;
    calls.api.mockImplementation(async (...args) =>
      args[2]?.action === "launch"
        ? {
            intentId: "40000000-0000-4000-8000-000000000099",
            status: "pending",
          }
        : api(...args),
    );
    const { purchase } = await import("./commerce");
    await expect(purchase(current.user, product)).rejects.toThrow(
      "launch could not be confirmed",
    );
    expect(calls.purchase).not.toHaveBeenCalled();
    expect(calls.clear).not.toHaveBeenCalled();
  });
  it("keeps cancelled checkout information with its original account after switching", async () => {
    const original = current.user;
    calls.purchase.mockImplementation(async () => {
      current.user = "00000000-0000-4000-8000-000000000099";
      throw { code: "1" };
    });
    const { purchase } = await import("./commerce");
    await expect(purchase(original, product)).rejects.toThrow(
      "account changed",
    );
    expect(calls.save).toHaveBeenLastCalledWith(
      original,
      expect.objectContaining({ observation: "cancelled" }),
    );
    expect(calls.clear).not.toHaveBeenCalled();
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("native restore without enabling new purchases", () => {
  const intentId = "40000000-0000-4000-8000-000000000001";
  const saved = {
    requestId: intentId,
    intentId,
    productId: "pack20",
    phase: "launched",
    observation: "payment_pending",
  };
  it("a recovery check requests bounded server reconciliation without opening the store", async () => {
    calls.journal.mockResolvedValue(saved);
    calls.api.mockImplementation(async (path) =>
      path === "/v1/capabilities"
        ? { commerceReady: false, recoveryReady: true }
        : { intentId, status: "pending" },
    );
    const { checkRecovery } = await import("./commerce");
    expect(await checkRecovery(current.user)).toEqual({
      status: "awaiting_store",
    });
    expect(calls.api).toHaveBeenCalledWith(
      "/v1/purchases/reconcile",
      expect.anything(),
      {},
    );
    expect(calls.restore).not.toHaveBeenCalled();
    expect(calls.purchase).not.toHaveBeenCalled();
    expect(calls.clear).not.toHaveBeenCalled();
  });
  it.each(["checkRecovery", "restore"] as const)(
    "%s honours exact verification over the previous device cancellation",
    async (method) => {
      calls.journal.mockResolvedValue({ ...saved, observation: "cancelled" });
      calls.api.mockImplementation(async (path) =>
        path === "/v1/capabilities"
          ? { commerceReady: false, recoveryReady: true }
          : { intentId, status: "verified" },
      );
      const commerce = await import("./commerce");
      expect(await commerce[method](current.user)).toEqual({
        status: "verified",
      });
      expect(calls.clear).toHaveBeenCalledWith(current.user);
      expect(calls.purchase).not.toHaveBeenCalled();
    },
  );
  it("Restore does not hide an unresolved exact checkout behind a synchronized history", async () => {
    calls.journal.mockResolvedValue(saved);
    calls.api.mockImplementation(async (path) =>
      path === "/v1/capabilities"
        ? { commerceReady: false, recoveryReady: true }
        : path === "/v1/purchases/reconcile"
          ? { status: "synchronized" }
          : { intentId, status: "pending" },
    );
    const { restore } = await import("./commerce");
    expect(await restore(current.user)).toEqual({ status: "awaiting_store" });
    expect(calls.clear).not.toHaveBeenCalled();
  });
  it("preserves a support-review result instead of treating it as ordinary pending", async () => {
    calls.journal.mockResolvedValue(saved);
    calls.api.mockImplementation(async (path) =>
      path === "/v1/capabilities"
        ? { commerceReady: false, recoveryReady: true }
        : path === "/v1/purchases/reconcile"
          ? { status: "needs_review" }
          : { intentId, status: "pending" },
    );
    const { checkRecovery } = await import("./commerce");
    expect(await checkRecovery(current.user)).toEqual({
      status: "needs_review",
    });
    expect(calls.clear).not.toHaveBeenCalled();
  });
  it("does not return a prior account's saved checkout notice", async () => {
    const original = current.user;
    calls.journal.mockImplementation(async () => {
      current.user = "00000000-0000-4000-8000-000000000099";
      return saved;
    });
    const { purchaseRecoveryNotice } = await import("./commerce");
    await expect(purchaseRecoveryNotice(original)).rejects.toThrow(
      "account changed",
    );
    expect(calls.api).not.toHaveBeenCalled();
  });
  it("loads a redacted saved checkout notice without any network request", async () => {
    calls.journal.mockResolvedValue(saved);
    const { purchaseRecoveryNotice } = await import("./commerce");
    expect(await purchaseRecoveryNotice(current.user)).toEqual({
      reference: intentId,
      status: "awaiting_store",
    });
    expect(calls.api).not.toHaveBeenCalled();
  });
  it("does not display raw store errors from Restore", async () => {
    calls.restore.mockRejectedValue(new Error("receipt=private-customer-data"));
    const { restore } = await import("./commerce");
    await expect(restore(current.user)).rejects.toThrow(
      "store history could not be checked",
    );
    expect(
      calls.api.mock.calls.some(([path]) => path === "/v1/purchases/reconcile"),
    ).toBe(false);
  });
  it.each(["cancelled", "expired", "not_found"])(
    "clears a %s unstarted selection after a lost eligibility response",
    async (status) => {
      const requestId = "30000000-0000-4000-8000-000000000001";
      calls.journal.mockResolvedValue({
        requestId,
        intentId: null,
        productId: "pack20",
        phase: "preparing",
      });
      calls.api.mockImplementation(async (path) =>
        path === "/v1/capabilities"
          ? { commerceReady: false, recoveryReady: true }
          : { intentId: status === "not_found" ? null : requestId, status },
      );
      const { checkRecovery } = await import("./commerce");
      expect(await checkRecovery(current.user)).toEqual({
        status: "selection_cleared",
      });
      expect(calls.api).toHaveBeenCalledWith(
        "/v1/purchases/recover-selection",
        expect.anything(),
        { store: "APP_STORE", requestId },
      );
      expect(calls.clear).toHaveBeenCalledWith(current.user);
      expect(calls.purchase).not.toHaveBeenCalled();
    },
  );
  it("preserves a recovered launched intent instead of clearing it", async () => {
    const intentId = "40000000-0000-4000-8000-000000000001";
    calls.journal.mockResolvedValue({
      requestId: intentId,
      intentId: null,
      productId: "pack20",
      phase: "preparing",
    });
    calls.api.mockImplementation(async (path) =>
      path === "/v1/capabilities"
        ? { commerceReady: false, recoveryReady: true }
        : { intentId, status: "pending" },
    );
    const { checkRecovery } = await import("./commerce");
    expect(await checkRecovery(current.user)).toEqual({
      status: "interrupted",
    });
    expect(calls.save).toHaveBeenCalledWith(
      current.user,
      expect.objectContaining({ intentId, phase: "launched" }),
    );
    expect(calls.clear).not.toHaveBeenCalled();
    expect(calls.purchase).not.toHaveBeenCalled();
  });
  it("retains the journal when selection recovery loses connectivity", async () => {
    calls.journal.mockResolvedValue({
      requestId: "40000000-0000-4000-8000-000000000001",
      intentId: null,
      productId: "pack20",
      phase: "preparing",
    });
    calls.api.mockImplementation(async (path) => {
      if (path === "/v1/capabilities")
        return { commerceReady: false, recoveryReady: true };
      throw new Error("connection interrupted");
    });
    const { checkRecovery } = await import("./commerce");
    await expect(checkRecovery(current.user)).rejects.toThrow("interrupted");
    expect(calls.clear).not.toHaveBeenCalled();
  });
  it("rejects RevenueCat Test Store keys because this backend verifies actual Apple/Google sandboxes", async () => {
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_IOS_KEY", "test_fixture");
    const { restore } = await import("./commerce");
    await expect(restore(current.user)).rejects.toThrow("platform-specific");
    expect(calls.restore).not.toHaveBeenCalled();
  });
  it("restores with the authenticated UUID while acquisition is disabled", async () => {
    const { restore } = await import("./commerce");
    expect(await restore(current.user)).toEqual({ status: "pending" });
    expect(current.storeUser).toBe(current.user);
    expect(calls.restore).toHaveBeenCalledOnce();
    expect(calls.purchase).not.toHaveBeenCalled();
    expect(calls.api).toHaveBeenCalledWith(
      "/v1/purchases/reconcile",
      expect.anything(),
      {},
    );
  });
  it("does not reconcile under a different account if sign-out/switch occurs during the store sheet", async () => {
    const { restore } = await import("./commerce");
    calls.restore.mockImplementation(async () => {
      current.user = "00000000-0000-4000-8000-000000000099";
    });
    await expect(restore(current.user)).rejects.toThrow("account changed");
    expect(
      calls.api.mock.calls.some(([path]) => path === "/v1/purchases/reconcile"),
    ).toBe(false);
  });
  it("does not open a store sheet when server recovery is disabled", async () => {
    const { restore } = await import("./commerce");
    current.recovery = false;
    await expect(restore(current.user)).rejects.toThrow("unavailable");
    expect(calls.restore).not.toHaveBeenCalled();
  });
  it("status checks do not open the store or initiate another reconciliation", async () => {
    const { checkRecovery } = await import("./commerce");
    await checkRecovery(current.user);
    expect(calls.api).toHaveBeenCalledWith(
      "/v1/purchases/reconcile",
      expect.anything(),
    );
    expect(calls.restore).not.toHaveBeenCalled();
  });
  it.each(["pending", "needs_review", "no_purchases_found"] as const)(
    "%s is never described as a successful payment",
    (status) => {
      const message = recoveryMessage(status);
      expect(message.body.toLowerCase()).toMatch(/do not (purchase|buy) again/);
      expect(message.title).not.toContain("checked");
    },
  );
});
