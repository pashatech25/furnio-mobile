import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  mode: { OS: "ios" },
  main: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
    setSession: vi.fn(),
  },
  temp: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    signInWithIdToken: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    signOut: vi.fn(),
    stopAutoRefresh: vi.fn(),
    mfa: { challenge: vi.fn(), verify: vi.fn() },
  },
  create: vi.fn(),
  browser: vi.fn(),
  apple: vi.fn(),
  redirect: "",
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: fixture.create }));
vi.mock("./client", () => ({ supabase: { auth: fixture.main } }));
vi.mock("../config", () => ({
  demo: false,
  config: {
    supabase: "https://staging.fixture",
    key: "sb_publishable_fixture",
  },
}));
vi.mock("react-native", () => ({ Platform: fixture.mode }));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-1111-4111-8111-111111111111",
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async () => "hashed-nonce",
}));
vi.mock("expo-linking", () => ({
  createURL: (path: string, options: { queryParams: Record<string, string> }) =>
    `furnio://${path}?${new URLSearchParams(options.queryParams)}`,
}));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: fixture.browser }));
vi.mock("expo-apple-authentication", () => ({
  AppleAuthenticationScope: { EMAIL: "email" },
  signInAsync: fixture.apple,
}));
import { createNativeDeletionReauthentication } from "./deletion-client";
const user = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const sid = "33333333-3333-4333-8333-333333333333",
  tempSid = "44444444-4444-4444-8444-444444444444";
function session(sessionId: string, assurance = "aal1") {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user,
      session_id: sessionId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      aal: assurance,
    }),
  ).toString("base64url");
  return { access_token: `header.${payload}.fixture-signature` };
}
function account() {
  return {
    id: user,
    email: "fixture@example.invalid",
    is_anonymous: false,
    identities: [
      { provider: "email" },
      { provider: "google" },
      { provider: "apple" },
    ],
    factors: [],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  fixture.mode.OS = "ios";
  fixture.redirect = "";
  fixture.create.mockReturnValue({ auth: fixture.temp });
  fixture.main.getSession.mockResolvedValue({
    data: { session: session(sid) },
    error: null,
  });
  fixture.main.getUser.mockResolvedValue({
    data: { user: account() },
    error: null,
  });
  fixture.temp.getSession.mockResolvedValue({
    data: { session: session(tempSid) },
    error: null,
  });
  fixture.temp.getUser.mockResolvedValue({
    data: { user: account() },
    error: null,
  });
  fixture.temp.signInWithPassword.mockResolvedValue({ error: null });
  fixture.temp.signInWithIdToken.mockResolvedValue({ error: null });
  fixture.temp.signInWithOAuth.mockImplementation(async (input) => {
    fixture.redirect = input.options.redirectTo;
    return {
      data: { url: "https://accounts.google.com/fixture" },
      error: null,
    };
  });
  fixture.browser.mockImplementation(async () => ({
    type: "success",
    url: `${fixture.redirect}&code=fixture-code&sb_flow_id=fixture-pkce`,
  }));
  fixture.temp.exchangeCodeForSession.mockResolvedValue({ error: null });
  fixture.apple.mockResolvedValue({ identityToken: "fixture-apple-token" });
  fixture.temp.signOut.mockResolvedValue({ error: null });
});
describe("actual native Supabase privacy adapter", () => {
  it("creates a non-persisted PKCE client, never overwrites or signs out the application session", async () => {
    const flow = createNativeDeletionReauthentication(user);
    await flow.signIn("password", "fixture-password");
    await flow.dispose();
    expect(fixture.create).toHaveBeenCalledWith(
      "https://staging.fixture",
      "sb_publishable_fixture",
      {
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: "pkce",
          storageKey: expect.stringContaining("furnio-private-"),
        }),
      },
    );
    expect(fixture.temp.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(fixture.main.setSession).not.toHaveBeenCalled();
    expect(fixture.main.signOut).not.toHaveBeenCalled();
  });
  it("uses a separate OAuth callback and exchanges only its PKCE code", async () => {
    const flow = createNativeDeletionReauthentication(user);
    await flow.signIn("google");
    expect(fixture.redirect).toContain("auth/deletion-callback?flow=");
    expect(fixture.temp.exchangeCodeForSession).toHaveBeenCalledWith(
      "fixture-code",
      { flowId: "fixture-pkce" },
    );
    expect(fixture.main.setSession).not.toHaveBeenCalled();
    await flow.dispose();
  });
  it("never exchanges a callback intended for the normal login", async () => {
    fixture.browser.mockImplementation(async () => ({
      type: "success",
      url:
        fixture.redirect.replace("deletion-callback", "callback") +
        "&code=fixture",
    }));
    await expect(
      createNativeDeletionReauthentication(user).signIn("google"),
    ).rejects.toThrow();
    expect(fixture.temp.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("cancels OAuth without touching the main session", async () => {
    fixture.browser.mockResolvedValue({ type: "cancel" });
    await expect(
      createNativeDeletionReauthentication(user).signIn("google"),
    ).rejects.toThrow("cancelled");
    expect(fixture.main.signOut).not.toHaveBeenCalled();
    expect(fixture.temp.signOut).toHaveBeenCalled();
  });
  it("binds native Apple proof to the original nonce without persisting the credential", async () => {
    const flow = createNativeDeletionReauthentication(user);
    await flow.signIn("apple");
    expect(fixture.apple).toHaveBeenCalledWith({
      requestedScopes: ["email"],
      nonce: "hashed-nonce",
    });
    expect(fixture.temp.signInWithIdToken).toHaveBeenCalledWith({
      provider: "apple",
      token: "fixture-apple-token",
      nonce: user,
    });
    expect(fixture.main.setSession).not.toHaveBeenCalled();
    await flow.dispose();
  });
  it("does not expose Apple verification on Android", async () => {
    fixture.mode.OS = "android";
    const flow = createNativeDeletionReauthentication(user);
    expect((await flow.initialize()).methods).toEqual(["password", "google"]);
    await expect(flow.signIn("apple")).rejects.toThrow("already linked");
  });
  it("never trusts user-editable metadata for the account's methods", async () => {
    fixture.main.getUser.mockResolvedValue({
      data: {
        user: {
          ...account(),
          identities: [],
          user_metadata: { providers: ["google"] },
        },
      },
      error: null,
    });
    await expect(
      createNativeDeletionReauthentication(user).signIn("google"),
    ).rejects.toThrow("already linked");
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it("rejects a verified server user that disagrees with the token identity", async () => {
    fixture.temp.getUser.mockResolvedValue({
      data: { user: { ...account(), id: other } },
      error: null,
    });
    await expect(
      createNativeDeletionReauthentication(user).signIn("password", "fixture"),
    ).rejects.toThrow();
    expect(fixture.temp.signOut).toHaveBeenCalled();
  });
  it("requires existing MFA and verifies a challenge without enrolling any factor", async () => {
    fixture.temp.getUser.mockResolvedValue({
      data: {
        user: {
          ...account(),
          factors: [{ id: other, factor_type: "totp", status: "verified" }],
        },
      },
      error: null,
    });
    fixture.temp.mfa.challenge.mockResolvedValue({
      data: { id: "challenge-fixture" },
      error: null,
    });
    fixture.temp.mfa.verify.mockImplementation(async () => {
      fixture.temp.getSession.mockResolvedValue({
        data: { session: session(tempSid, "aal2") },
        error: null,
      });
      return { error: null };
    });
    const flow = createNativeDeletionReauthentication(user);
    expect(await flow.signIn("google")).toMatchObject({ ready: false });
    await flow.challenge(other);
    expect(await flow.verifyCode("123456")).toMatchObject({ ready: true });
    expect(fixture.temp.mfa.verify).toHaveBeenCalledWith({
      factorId: other,
      challengeId: "challenge-fixture",
      code: "123456",
    });
    await flow.dispose();
  });
  it("rejects browser preview use of the live private adapter", async () => {
    fixture.mode.OS = "web";
    await expect(
      createNativeDeletionReauthentication(user).initialize(),
    ).rejects.toThrow("native app");
    expect(fixture.main.getUser).not.toHaveBeenCalled();
  });
});
