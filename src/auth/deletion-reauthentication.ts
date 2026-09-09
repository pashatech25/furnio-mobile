import { z } from "zod";

export type DeletionSignInMethod = "password" | "google" | "apple";
export type DeletionIdentity = {
  id: string;
  sessionId: string;
  email: string | null;
  methods: DeletionSignInMethod[];
};
export type DeletionFactor = { id: string; kind: "totp" | "phone" };
type VerifiedSession = {
  id: string;
  sessionId: string;
  accessToken: string;
  expiresAt: number;
  requiresMfa: boolean;
  factors: DeletionFactor[];
};
export type IsolatedDeletionSignIn = {
  signIn(
    method: DeletionSignInMethod,
    email: string | null,
    password?: string,
  ): Promise<void>;
  verify(): Promise<VerifiedSession>;
  challenge(factor: DeletionFactor): Promise<string>;
  verifyCode(
    factor: DeletionFactor,
    challenge: string,
    code: string,
  ): Promise<void>;
  dispose(): Promise<void>;
};

// Client lifecycle protection, NOT authorization. The Worker independently verifies
// Auth identity, session existence, AMR freshness and MFA before every mutation.
export function createDeletionReauthentication(deps: {
  expectedUserId: string;
  currentIdentity(): Promise<DeletionIdentity>;
  createIsolated(): IsolatedDeletionSignIn;
  now(): number;
}) {
  let identity: DeletionIdentity | null = null;
  let temporary: IsolatedDeletionSignIn | null = null;
  let verified: VerifiedSession | null = null;
  let startedAt = 0;
  let disposed = false;
  let busy = false;
  let challenge: { factor: DeletionFactor; id: string } | null = null;
  const changed = () =>
    new Error(
      "Your signed-in account changed. Close this review and start again.",
    );
  async function assertCurrent() {
    if (disposed) throw changed();
    const current = await deps.currentIdentity();
    if (
      disposed ||
      current.id !== deps.expectedUserId ||
      (identity &&
        (identity.id !== current.id ||
          identity.sessionId !== current.sessionId))
    )
      throw changed();
    if (
      !z.uuid().safeParse(current.id).success ||
      !z.uuid().safeParse(current.sessionId).success
    )
      throw changed();
    identity ??= current;
    return current;
  }
  function fresh() {
    if (disposed || !temporary || deps.now() >= startedAt + 300_000) {
      verified = null;
      throw new Error(
        "Verification expired. Verify your identity again before continuing.",
      );
    }
  }
  async function exclusive<T>(work: () => Promise<T>) {
    if (busy)
      throw new Error("Please finish the current verification step first.");
    busy = true;
    try {
      return await work();
    } finally {
      busy = false;
    }
  }
  async function verifySameAccount() {
    fresh();
    const result = await temporary!.verify();
    await assertCurrent();
    fresh();
    if (
      result.id !== identity!.id ||
      !z.uuid().safeParse(result.sessionId).success ||
      result.sessionId === identity!.sessionId ||
      result.expiresAt <= deps.now()
    ) {
      await temporary!.dispose();
      temporary = null;
      verified = null;
      throw new Error(
        "That sign-in is not the same Furnio account. Your normal app sign-in has not been replaced.",
      );
    }
    verified = result;
    return {
      ready: !result.requiresMfa,
      factors: result.factors,
      expiresAt: Math.min(result.expiresAt, startedAt + 300_000),
    };
  }
  return {
    initialize: () => exclusive(assertCurrent),
    signIn: (method: DeletionSignInMethod, password?: string) =>
      exclusive(async () => {
        const current = await assertCurrent();
        if (!current.methods.includes(method))
          throw new Error(
            "Use a sign-in method already linked to this account.",
          );
        if (method === "password" && (!current.email || !password))
          throw new Error("Enter the password for this Furnio account.");
        verified = null;
        challenge = null;
        if (temporary) await temporary.dispose();
        await assertCurrent();
        const instance = deps.createIsolated();
        temporary = instance;
        startedAt = deps.now();
        try {
          await instance.signIn(method, current.email, password);
          return await verifySameAccount();
        } catch (error) {
          // A delayed OAuth completion after unmount must also revoke its temporary
          // session; disposing only before that completion is insufficient.
          await instance.dispose();
          if (temporary === instance) temporary = null;
          verified = null;
          throw error;
        }
      }),
    challenge: (factorId: string) =>
      exclusive(async () => {
        await assertCurrent();
        fresh();
        const factor =
          verified?.requiresMfa &&
          verified.factors.find((entry) => entry.id === factorId);
        if (!factor)
          throw new Error("Select an existing verified authentication factor.");
        challenge = null;
        const id = await temporary!.challenge(factor);
        await assertCurrent();
        fresh();
        challenge = { factor, id };
        return factor.kind;
      }),
    verifyCode: (code: string) =>
      exclusive(async () => {
        await assertCurrent();
        fresh();
        if (!challenge || !/^\d{6}$/.test(code))
          throw new Error("Enter the six-digit verification code.");
        await temporary!.verifyCode(challenge.factor, challenge.id, code);
        const result = await verifySameAccount();
        challenge = null;
        return result;
      }),
    token: (userId: string) =>
      exclusive(async () => {
        await assertCurrent();
        fresh();
        if (
          userId !== identity!.id ||
          !verified ||
          verified.requiresMfa ||
          verified.expiresAt <= deps.now()
        )
          throw new Error("Verify this account before continuing.");
        // Freeze the exact verified token for prepare/confirm/cancel. Refreshing
        // the normal app token must never silently extend this confirmation window.
        return verified.accessToken;
      }),
    clearProof: async () => {
      verified = null;
      challenge = null;
      const instance = temporary;
      temporary = null;
      if (instance) await instance.dispose();
    },
    dispose: async () => {
      disposed = true;
      verified = null;
      challenge = null;
      if (temporary) await temporary.dispose();
    },
  };
}
