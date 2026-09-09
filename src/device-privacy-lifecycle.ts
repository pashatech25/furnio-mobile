// Native device cleanup coordination only; never revokes or creates an Auth session.
export function createDevicePrivacyLifecycle<T extends { id: string }>(deps: {
  setOwner(user: string | null): Promise<void>;
  starting(): void;
  ready(user: T | null): void;
  failed(user: T | null): void;
}) {
  let revision = 0,
    disposed = false,
    ready = false;
  let owner: string | null | undefined;
  return {
    accept(user: T | null): Promise<void> {
      if (disposed) return Promise.resolve();
      if (ready && owner === (user?.id ?? null)) {
        deps.ready(user);
        return Promise.resolve();
      }
      ready = false;
      owner = user?.id ?? null;
      const current = ++revision;
      deps.starting();
      return deps
        .setOwner(owner)
        .then(() => {
          if (disposed || current !== revision) return;
          ready = true;
          deps.ready(user);
        })
        .catch(() => {
          if (disposed || current !== revision) return;
          deps.failed(user);
        });
    },
    dispose() {
      disposed = true;
      revision++;
    },
  };
}
