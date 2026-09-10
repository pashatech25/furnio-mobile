/** Prevent overlapping review exports and discard late work after leaving. */
export function createBatchReviewGate() {
  let active = false;
  let generation = 0;
  return {
    get active() {
      return active;
    },
    invalidate() {
      generation++;
    },
    async run(work: (current: () => boolean) => Promise<void>) {
      if (active) return false;
      active = true;
      const ticket = generation;
      try {
        await work(() => ticket === generation);
        return ticket === generation;
      } finally {
        active = false;
      }
    },
  };
}
