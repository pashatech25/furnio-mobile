import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { nativeCommerceAllowed } from "./commerce-policy";

const io = vi.hoisted(() => ({ api: vi.fn(), session: vi.fn(), sdk: vi.fn() }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./config", () => ({ demo: false }));
vi.mock("./auth/client", () => ({
  supabase: { auth: { getSession: io.session } },
}));
vi.mock("./state", () => ({ mobileApi: io.api }));
vi.mock("expo-crypto", () => ({ randomUUID: vi.fn() }));
vi.mock("./purchase-journal", () => ({
  readPurchaseJournal: vi.fn(),
  savePurchaseJournal: vi.fn(),
  clearPurchaseJournal: vi.fn(),
}));
vi.mock("react-native-purchases", () => ({
  default: { configure: io.sdk, isConfigured: io.sdk },
  PRODUCT_CATEGORY: {},
  PURCHASES_ERROR_CODE: {},
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("website-only companion release", () => {
  it("cannot be turned into a store checkout by an old environment flag", async () => {
    vi.stubEnv("EXPO_PUBLIC_PURCHASES_ENABLED", "true");
    vi.resetModules();
    const commerce = await import("./commerce");
    expect(nativeCommerceAllowed).toBe(false);
    expect(commerce.purchasesEnabled).toBe(false);
    expect(commerce.restorationAvailable).toBe(false);
    await expect(commerce.loadStoreProducts("owner", [])).rejects.toThrow(
      "not enabled",
    );
    await expect(commerce.restore("owner")).rejects.toThrow("not enabled");
    await expect(commerce.checkRecovery("owner")).rejects.toThrow(
      "not enabled",
    );
    expect(io.api).not.toHaveBeenCalled();
    expect(io.session).not.toHaveBeenCalled();
    expect(io.sdk).not.toHaveBeenCalled();
  });

  it("has no app route importing store checkout or RevenueCat", () => {
    function inspect(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) inspect(path);
        else if (/\.tsx?$/.test(entry.name)) {
          const source = readFileSync(path, "utf8");
          expect(source, path).not.toMatch(
            /from\s+["'][^"']*(?:react-native-purchases|\/commerce)["']/,
          );
        }
      }
    }
    inspect(resolve("app"));
  });

  it("keeps the wallet read-only, including its zero-credit state", () => {
    const source = readFileSync(resolve("app/wallet.tsx"), "utf8");
    expect(source).toContain("balance === 0");
    expect(source).toContain("Refresh balance");
    expect(source).toContain("useFocusEffect");
    expect(source).toContain('state === "active"');
    expect(source).not.toMatch(
      /Linking|openURL|demoPurchase|loadStoreProducts|\/purchases|https?:\/\//,
    );
    expect(source).not.toMatch(
      /title=["'](?:Buy|Restore purchases|Manage.*subscription)/,
    );
    expect(source).not.toContain("never expire");
    const home = readFileSync(resolve("app/(tabs)/index.tsx"), "utf8");
    expect(home).toContain('title="View credits"');
    expect(home).not.toContain('title="Add credits"');
  });
  it("excludes the deferred store SDK from native linking and active app configuration", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve("package.json"), "utf8"),
    );
    expect(packageJson.dependencies["react-native-purchases"]).toBeUndefined();
    expect(packageJson.expo.autolinking.exclude).toContain(
      "react-native-purchases",
    );
    expect(readFileSync(resolve("app.config.ts"), "utf8")).not.toContain(
      "with-store-purchases",
    );
    const state = readFileSync(resolve("src/state.tsx"), "utf8");
    expect(state).toContain("readWebsiteBilling(api)");
    expect(state).not.toMatch(/\/v1\/billing|capabilitiesSchema/);
  });
});
