/** Keep the request deadline even when its owning screen supplies cancellation. */
export function requestDeadline(
  timeoutMs: number,
  signals: (AbortSignal | undefined)[],
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const active = signals.filter((signal): signal is AbortSignal => !!signal);
  for (const signal of active) {
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  }
  const timer = setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      for (const signal of active) signal.removeEventListener("abort", abort);
    },
  };
}

export type RequestBoundary = {
  signal: AbortSignal;
  assertCurrent: () => void;
};
