import { z } from "zod";

export type OperationSession = {
  access_token: string;
  user: { id: string; is_anonymous?: boolean };
};
export type OperationSessionSource = {
  read: () => Promise<OperationSession | null>;
  // The callback is intentionally synchronous: never await an Auth SDK call here.
  subscribe: (
    callback: (session: OperationSession | null) => void,
  ) => () => void;
};
const claimsSchema = z.object({ sub: z.uuid(), session_id: z.uuid() });
function identity(session: OperationSession | null) {
  if (!session || session.user.is_anonymous)
    throw new Error("No customer session.");
  if (session.access_token.length > 32_768) throw new Error("Invalid session.");
  const parts = session.access_token.split(".");
  if (parts.length !== 3) throw new Error("Invalid session.");
  // Local correlation ONLY, not authentication/authorization. The API still
  // verifies the signed bearer and all account, credit and service permissions.
  const claims = claimsSchema.parse(
    JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))),
  );
  if (claims.sub !== session.user.id)
    throw new Error("Session identity changed.");
  return { userId: claims.sub, sessionId: claims.session_id };
}

export class OperationStopped extends Error {
  constructor() {
    super(
      "This edit stopped because its screen or sign-in changed. Already accepted jobs may still finish; check your project before submitting again.",
    );
  }
}

/** Ephemeral scopes; no photos, tokens or session IDs are persisted. */
export function createOperationManager(source: OperationSessionSource | null) {
  const active = new Set<() => void>();
  let paused = 0;
  return {
    pause() {
      paused += 1;
      for (const cancel of [...active]) cancel();
      let resumed = false;
      return () => {
        if (!resumed) {
          resumed = true;
          paused -= 1;
        }
      };
    },
    begin(userId: string, parent: AbortSignal) {
      if (paused || parent.aborted || !z.uuid().safeParse(userId).success)
        throw new OperationStopped();
      const controller = new AbortController();
      let sessionId: string | null = null;
      let unsubscribe: (() => void) | undefined;
      const cancel = () => {
        controller.abort();
        unsubscribe?.();
        unsubscribe = undefined;
        parent.removeEventListener("abort", cancel);
        active.delete(cancel);
      };
      const assertCurrent = () => {
        if (controller.signal.aborted || parent.aborted || paused)
          throw new OperationStopped();
      };
      const accept = (session: OperationSession | null) => {
        try {
          assertCurrent();
          const next = identity(session);
          if (
            next.userId !== userId ||
            (sessionId && sessionId !== next.sessionId)
          )
            throw new OperationStopped();
          sessionId = next.sessionId;
        } catch {
          cancel();
          throw new OperationStopped();
        }
      };
      parent.addEventListener("abort", cancel, { once: true });
      active.add(cancel);
      try {
        unsubscribe = source?.subscribe((session) => {
          try {
            accept(session);
          } catch {
            /* SDK notification must not throw. */
          }
        });
        // Also handles a source that synchronously notified during subscribe.
        if (controller.signal.aborted) {
          unsubscribe?.();
          unsubscribe = undefined;
        }
        assertCurrent();
      } catch {
        cancel();
        throw new OperationStopped();
      }
      return {
        signal: controller.signal,
        assertCurrent,
        get current() {
          return !controller.signal.aborted && !parent.aborted && !paused;
        },
        async getToken() {
          assertCurrent();
          if (!source)
            throw new Error(
              "Demo operations cannot request account credentials.",
            );
          let session: OperationSession | null;
          try {
            session = await source.read();
          } catch {
            assertCurrent();
            throw new Error(
              "Your sign-in could not be checked. Reconnect before continuing; no further request was sent.",
            );
          }
          assertCurrent();
          accept(session);
          return session!.access_token;
        },
        dispose: cancel,
      };
    },
  };
}
export type OperationScope = ReturnType<
  ReturnType<typeof createOperationManager>["begin"]
>;
