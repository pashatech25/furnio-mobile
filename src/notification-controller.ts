import { z } from "zod";
export const notificationStateSchema = z.object({
  installationId: z.uuid(),
  installationSecret: z.string().regex(/^[a-f0-9]{64}$/),
  revision: z.number().int().min(0).max(2_000_000_000),
  userId: z.uuid().nullable(),
  enabled: z.boolean(),
  pendingDisable: z.boolean(),
});
export type NotificationState = z.infer<typeof notificationStateSchema>;
export type Installation = Pick<
  NotificationState,
  "installationId" | "installationSecret" | "revision"
>;
export type NotificationDependencies = {
  read: () => Promise<NotificationState | null>;
  write: (state: NotificationState) => Promise<void>;
  fresh: () => Promise<NotificationState>;
  currentUser: () => Promise<string | null>;
  permission: (prompt: boolean) => Promise<boolean>;
  register: (
    state: NotificationState,
    userId: string,
  ) => Promise<{ enabled: boolean }>;
  disable: (state: NotificationState) => Promise<{ enabled: boolean }>;
};
// One serialized operation stream per installation, not per React component.
// Persist revisions BEFORE network requests. Retries reuse the same disable
// revision; delayed enables cannot win against a later disable on the server.
export function createNotificationController(deps: NotificationDependencies) {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(run: () => Promise<T>): Promise<T> => {
    const result = tail.then(run, run);
    tail = result.catch(() => undefined);
    return result;
  };
  const next = (state: NotificationState) => {
    if (state.revision >= 2_000_000_000)
      throw new Error("Notification installation needs support.");
    return { ...state, revision: state.revision + 1 };
  };
  async function stop(state: NotificationState) {
    const pending = state.pendingDisable
      ? state
      : { ...next(state), enabled: false, pendingDisable: true };
    await deps.write(pending);
    // Do not clear identity/capability until the disable is acknowledged.
    if ((await deps.disable(pending)).enabled)
      throw new Error(
        "Notification cleanup has not been confirmed. Try again when connected.",
      );
    const disabled = { ...pending, userId: null, pendingDisable: false };
    await deps.write(disabled);
    return disabled;
  }
  async function update(userId: string, prompt: boolean) {
    let state = await deps.read();
    if (
      state &&
      (state.pendingDisable || (state.userId && state.userId !== userId))
    )
      state = await stop(state);
    if (!prompt && (!state?.enabled || state.userId !== userId)) return state;
    if ((await deps.currentUser()) !== userId)
      throw new Error(
        "Your account changed. Open notification settings again.",
      );
    if (!(await deps.permission(prompt))) {
      if (state?.enabled) await stop(state);
      if (prompt)
        throw new Error(
          "Notifications are off in device settings. Enable them there, then try again.",
        );
      return deps.read();
    }
    if ((await deps.currentUser()) !== userId)
      throw new Error(
        "Your account changed. Open notification settings again.",
      );
    state = {
      ...next(next(state ?? (await deps.fresh()))),
      userId,
      enabled: false,
      pendingDisable: true,
    };
    // A failed/uncertain registration leaves a durable cleanup intent. Reserve
    // the NEXT revision for cleanup, so it overrides even an accepted response
    // lost in transit. No automatic opt-in on the next account or launch.
    await deps.write({ ...next(state), pendingDisable: true });
    const result = await deps.register(state, userId);
    if ((await deps.currentUser()) !== userId) {
      await stop({ ...next(state), pendingDisable: true });
      throw new Error(
        "Your account changed. Notifications were turned off for this installation.",
      );
    }
    if (!result.enabled)
      throw new Error(
        "The server did not enable notifications. Please try again.",
      );
    const enabled = { ...next(state), enabled: true, pendingDisable: false };
    await deps.write(enabled);
    return enabled;
  }
  return {
    enable: (userId: string) => serial(() => update(userId, true)),
    disable: () =>
      serial(async () => {
        const state = await deps.read();
        return state ? stop(state) : null;
      }),
    synchronize: (userId: string | null) =>
      serial(async () => {
        const state = await deps.read();
        if (!state) return null;
        if (state.pendingDisable || (state.userId && state.userId !== userId))
          return stop(state);
        if (!userId) return state.enabled ? stop(state) : state;
        return update(userId, false);
      }),
    read: () => serial(deps.read),
  };
}

// Push data never selects an arbitrary URL, project, image or another account.
export function isFurnioActivityNotification(data: unknown) {
  return z
    .object({ type: z.literal("furnio.activity"), version: z.literal(1) })
    .strict()
    .safeParse(data).success;
}
