import { describe, expect, it, vi } from "vitest";
import {
  createDeletionReauthentication,
  type DeletionIdentity,
  type IsolatedDeletionSignIn,
} from "./deletion-reauthentication";
const user = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const mainSession = "33333333-3333-4333-8333-333333333333",
  tempSession = "44444444-4444-4444-8444-444444444444";
function fixture() {
  let now = 1000;
  let account: DeletionIdentity = {
    id: user,
    sessionId: mainSession,
    email: "fixture@example.invalid",
    methods: ["password", "google", "apple"],
  };
  const session = {
    id: user,
    sessionId: tempSession,
    accessToken: "temporary-fixture-token",
    expiresAt: 600_000,
    requiresMfa: false,
    factors: [{ id: other, kind: "totp" as const }],
  };
  const temp = {
    signIn: vi.fn(async () => undefined),
    verify: vi.fn(async () => ({ ...session })),
    challenge: vi.fn(async () => "challenge-fixture"),
    verifyCode: vi.fn(async () => {
      session.requiresMfa = false;
    }),
    dispose: vi.fn(async () => undefined),
  } satisfies IsolatedDeletionSignIn;
  const create = vi.fn(() => temp);
  const flow = createDeletionReauthentication({
    expectedUserId: user,
    currentIdentity: async () => account,
    createIsolated: create,
    now: () => now,
  });
  return {
    flow,
    temp,
    session,
    create,
    change: (patch: Partial<DeletionIdentity>) => {
      account = { ...account, ...patch };
    },
    advance: (time: number) => {
      now += time;
    },
  };
}
describe("same-account isolated deletion verification", () => {
  it("uses only the server-verified account email and freezes its temporary bearer", async () => {
    const f = fixture();
    await f.flow.initialize();
    expect(await f.flow.signIn("password", "fixture-password")).toMatchObject({
      ready: true,
      expiresAt: 301_000,
    });
    expect(f.temp.signIn).toHaveBeenCalledWith(
      "password",
      "fixture@example.invalid",
      "fixture-password",
    );
    expect(await f.flow.token(user)).toBe("temporary-fixture-token");
    f.session.accessToken = "refreshed-token";
    expect(await f.flow.token(user)).toBe("temporary-fixture-token");
  });
  it("rejects the wrong initial account without starting sign-in", async () => {
    const f = fixture();
    f.change({ id: other });
    await expect(f.flow.initialize()).rejects.toThrow("account changed");
    expect(f.create).not.toHaveBeenCalled();
  });
  it("rejects an OAuth account with the same-looking email but a different UUID", async () => {
    const f = fixture();
    f.session.id = other;
    await expect(f.flow.signIn("google")).rejects.toThrow("not the same");
    expect(f.temp.dispose).toHaveBeenCalled();
    await expect(f.flow.token(user)).rejects.toThrow();
  });
  it("does not permit the normal session to masquerade as fresh verification", async () => {
    const f = fixture();
    f.session.sessionId = mainSession;
    await expect(f.flow.signIn("google")).rejects.toThrow("not the same");
  });
  it("rejects account switching while provider sign-in is in flight", async () => {
    const f = fixture();
    f.temp.signIn.mockImplementation(async () => {
      f.change({ id: other });
    });
    await expect(f.flow.signIn("google")).rejects.toThrow("account changed");
    expect(f.temp.dispose).toHaveBeenCalled();
  });
  it("rejects signing out and back in as the same user with another session", async () => {
    const f = fixture();
    await f.flow.signIn("google");
    f.change({ sessionId: other });
    await expect(f.flow.token(user)).rejects.toThrow("account changed");
  });
  it("binds confirmation to the requested UUID", async () => {
    const f = fixture();
    await f.flow.signIn("google");
    await expect(f.flow.token(other)).rejects.toThrow("Verify this account");
  });
  it("does not bypass an existing verified second factor", async () => {
    const f = fixture();
    f.session.requiresMfa = true;
    expect(await f.flow.signIn("password", "fixture")).toMatchObject({
      ready: false,
    });
    await expect(f.flow.token(user)).rejects.toThrow("Verify this account");
    await expect(f.flow.challenge(user)).rejects.toThrow("existing verified");
    expect(await f.flow.challenge(other)).toBe("totp");
    await expect(f.flow.verifyCode("123")).rejects.toThrow("six-digit");
    expect(await f.flow.verifyCode("123456")).toMatchObject({ ready: true });
    expect(f.temp.verifyCode).toHaveBeenCalledWith(
      { id: other, kind: "totp" },
      "challenge-fixture",
      "123456",
    );
    expect(await f.flow.token(user)).toBe("temporary-fixture-token");
  });
  it("rejects verification after five minutes even when the token remains valid", async () => {
    const f = fixture();
    await f.flow.signIn("google");
    f.advance(300_000);
    await expect(f.flow.token(user)).rejects.toThrow("expired");
  });
  it("does not let MFA extend the original verification deadline", async () => {
    const f = fixture();
    f.session.requiresMfa = true;
    await f.flow.signIn("google");
    f.advance(290_000);
    await f.flow.challenge(other);
    expect(await f.flow.verifyCode("123456")).toMatchObject({
      expiresAt: 301_000,
    });
  });
  it("does not permit a method not linked to the verified identity", async () => {
    const f = fixture();
    f.change({ methods: ["password"] });
    await expect(f.flow.signIn("google")).rejects.toThrow("already linked");
    expect(f.create).not.toHaveBeenCalled();
  });
  it("revokes an OAuth session that arrives after the screen was disposed", async () => {
    const f = fixture();
    let release!: () => void;
    f.temp.signIn.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = f.flow.signIn("google");
    await vi.waitFor(() => expect(f.temp.signIn).toHaveBeenCalled());
    await f.flow.dispose();
    const calls = f.temp.dispose.mock.calls.length;
    release();
    await expect(pending).rejects.toThrow();
    expect(f.temp.dispose.mock.calls.length).toBeGreaterThan(calls);
  });
  it("refuses concurrent verification steps and can start again after clearing proof", async () => {
    const f = fixture();
    await f.flow.signIn("google");
    await f.flow.clearProof();
    await expect(f.flow.token(user)).rejects.toThrow();
    await f.flow.signIn("google");
    expect(await f.flow.token(user)).toBe("temporary-fixture-token");
    await f.flow.dispose();
    await expect(f.flow.initialize()).rejects.toThrow("account changed");
  });
});
