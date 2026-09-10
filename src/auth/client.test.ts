import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));
vi.mock("react-native-url-polyfill/auto", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth }),
  processLock: vi.fn(),
}));
vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: auth.openAuthSessionAsync,
}));
vi.mock("expo-linking", () => ({
  createURL: () => "furnio://auth/callback",
}));
vi.mock("expo-apple-authentication", () => ({}));
vi.mock("expo-crypto", () => ({}));
vi.mock("../config", () => ({ demo: false, config: {} }));
vi.mock("./secure-storage", () => ({ secureStorage: {} }));

import { googleSignIn } from "./client";

describe("native Google account selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://example.test/oauth" },
      error: null,
    });
    auth.openAuthSessionAsync.mockResolvedValue({ type: "cancel" });
  });

  it("requests Google's account chooser on every sign-in, including after logout", async () => {
    await googleSignIn();
    await googleSignIn();
    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(2);
    for (const [request] of auth.signInWithOAuth.mock.calls) {
      expect(request).toEqual({
        provider: "google",
        options: {
          redirectTo: "furnio://auth/callback",
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
        },
      });
    }
    expect(auth.openAuthSessionAsync).toHaveBeenCalledWith(
      "https://example.test/oauth",
      "furnio://auth/callback",
    );
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("does not open a browser when authorization setup fails", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("Authorization unavailable"),
    });
    await expect(googleSignIn()).rejects.toThrow("Authorization unavailable");
    expect(auth.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it("still rejects callbacks from an unrelated origin", async () => {
    auth.openAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "https://example.test/auth/callback?code=not-a-real-code",
    });
    await expect(googleSignIn()).rejects.toThrow("Invalid authentication callback");
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
