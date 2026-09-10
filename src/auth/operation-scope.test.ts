import { describe, expect, it, vi } from "vitest";
import {
  createOperationManager,
  OperationStopped,
  type OperationSession,
} from "./operation-scope";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const loginA = "11111111-1111-4111-8111-111111111111";
const loginB = "22222222-2222-4222-8222-222222222222";
function session(user = userA, login = loginA, revision = 1): OperationSession {
  return {
    user: { id: user },
    access_token: `fixture.${btoa(JSON.stringify({ sub: user, session_id: login, revision }))}.fixture`,
  };
}
function fixture() {
  let current: OperationSession | null = session();
  const listeners = new Set<(session: OperationSession | null) => void>();
  const read = vi.fn(async () => current);
  const manager = createOperationManager({
    read,
    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  });
  const parent = new AbortController();
  return {
    manager,
    parent,
    read,
    listeners,
    begin: () => manager.begin(userA, parent.signal),
    emit(next: OperationSession | null) {
      current = next;
      for (const callback of [...listeners]) callback(next);
    },
  };
}
describe("editor session lifetime", () => {
  it("uses refreshed credentials only within the original Auth session", async () => {
    const f = fixture(),
      scope = f.begin();
    expect(await scope.getToken()).toBe(session().access_token);
    f.emit(session(userA, loginA, 2));
    expect(await scope.getToken()).toBe(session(userA, loginA, 2).access_token);
    scope.dispose();
    expect(f.listeners.size).toBe(0);
  });
  it.each([null, session(userB, loginB), session(userA, loginB)])(
    "permanently stops on logout/account/session replacement (%j)",
    async (next) => {
      const f = fixture(),
        scope = f.begin();
      await scope.getToken();
      f.emit(next);
      f.emit(session());
      await expect(scope.getToken()).rejects.toBeInstanceOf(OperationStopped);
      expect(f.read).toHaveBeenCalledTimes(1);
      expect(scope.signal.aborted).toBe(true);
      expect(f.listeners.size).toBe(0);
    },
  );
  it("blocks an A → B → A switch while the first session read is pending", async () => {
    const f = fixture();
    let release!: (session: OperationSession) => void;
    f.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const scope = f.begin(),
      pending = scope.getToken();
    f.emit(session(userB, loginB));
    f.emit(session());
    release(session());
    await expect(pending).rejects.toBeInstanceOf(OperationStopped);
    expect(scope.current).toBe(false);
  });
  it("blocks a mismatch already present before the operation", async () => {
    const f = fixture();
    f.emit(session(userB, loginB));
    const scope = f.begin();
    await expect(scope.getToken()).rejects.toBeInstanceOf(OperationStopped);
  });
  it.each([
    { user: { id: userA }, access_token: "not-a-jwt" },
    { user: { id: userB }, access_token: session().access_token },
    {
      user: { id: userA, is_anonymous: true },
      access_token: session().access_token,
    },
    {
      user: { id: userA },
      access_token: `x.${btoa(JSON.stringify({ sub: userA }))}.x`,
    },
  ])(
    "fails closed on malformed/anonymous session metadata",
    async (invalid) => {
      const f = fixture(),
        scope = f.begin();
      f.emit(invalid);
      await expect(scope.getToken()).rejects.toBeInstanceOf(OperationStopped);
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it("aborts on screen disposal and removes subscriptions", async () => {
    const f = fixture(),
      scope = f.begin();
    f.parent.abort();
    expect(scope.current).toBe(false);
    expect(f.listeners.size).toBe(0);
    await expect(scope.getToken()).rejects.toBeInstanceOf(OperationStopped);
    expect(() => f.begin()).toThrow(OperationStopped);
  });
  it("stops work immediately when sign-out begins, even if sign-out later fails", async () => {
    const f = fixture(),
      old = f.begin();
    const resume = f.manager.pause();
    expect(old.current).toBe(false);
    expect(() => f.begin()).toThrow(OperationStopped);
    resume();
    resume();
    await expect(old.getToken()).rejects.toBeInstanceOf(OperationStopped);
    const next = f.begin();
    expect(await next.getToken()).toBe(session().access_token);
    next.dispose();
  });
  it("balances overlapping sign-out pauses", () => {
    const f = fixture(),
      a = f.manager.pause(),
      b = f.manager.pause();
    a();
    expect(() => f.begin()).toThrow(OperationStopped);
    b();
    const scope = f.begin();
    scope.dispose();
  });
  it("redacts SDK errors without making a network request", async () => {
    const f = fixture(),
      scope = f.begin();
    f.read.mockRejectedValueOnce(new Error("secret bearer at private URL"));
    await expect(scope.getToken()).rejects.toThrow(
      "sign-in could not be checked",
    );
    expect(scope.current).toBe(true);
    scope.dispose();
  });
  it("handles a source that invokes the callback synchronously", () => {
    const unsubscribe = vi.fn();
    const manager = createOperationManager({
      read: vi.fn(),
      subscribe(callback) {
        callback(null);
        return unsubscribe;
      },
    });
    expect(() => manager.begin(userA, new AbortController().signal)).toThrow(
      OperationStopped,
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("never fetches credentials for a demo-only scope", async () => {
    const scope = createOperationManager(null).begin(
      userA,
      new AbortController().signal,
    );
    scope.assertCurrent();
    await expect(scope.getToken()).rejects.toThrow("Demo operations");
    scope.dispose();
  });
});
