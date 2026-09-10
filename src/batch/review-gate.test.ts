import { describe, expect, it, vi } from "vitest";
import { createBatchReviewGate } from "./review-gate";
function deferred() {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}
describe("batch review export gate", () => {
  it("locks synchronously and suppresses repeated button presses", async () => {
    const gate = createBatchReviewGate(),
      wait = deferred(),
      second = vi.fn();
    const first = gate.run(async (current) => {
      expect(current()).toBe(true);
      await wait.promise;
    });
    expect(gate.active).toBe(true);
    expect(await gate.run(second)).toBe(false);
    expect(second).not.toHaveBeenCalled();
    wait.finish();
    expect(await first).toBe(true);
    expect(gate.active).toBe(false);
  });
  it("invalidates a late export on unmount before it can create files or mark a review", async () => {
    const gate = createBatchReviewGate(),
      wait = deferred(),
      save = vi.fn();
    const operation = gate.run(async (current) => {
      await wait.promise;
      if (current()) save();
    });
    gate.invalidate();
    wait.finish();
    expect(await operation).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(gate.active).toBe(false);
  });
  it("releases the lock on failure and allows a new review", async () => {
    const gate = createBatchReviewGate();
    await expect(
      gate.run(async () => {
        throw new Error("invalid mask");
      }),
    ).rejects.toThrow("invalid mask");
    expect(gate.active).toBe(false);
    expect(
      await gate.run(async (current) => {
        expect(current()).toBe(true);
      }),
    ).toBe(true);
  });
});
