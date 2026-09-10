import { afterEach, describe, expect, it, vi } from "vitest";
import { requestDeadline } from "./deadline";
afterEach(() => vi.useRealTimers());
describe("abortable request deadlines", () => {
  it("keeps its timeout when a screen signal is supplied", () => {
    vi.useFakeTimers();
    const parent = new AbortController(),
      d = requestDeadline(30_000, [parent.signal]);
    vi.advanceTimersByTime(29_999);
    expect(d.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(d.signal.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(false);
    d.dispose();
  });
  it.each([0, 1])("accepts cancellation from signal %s", (which) => {
    const a = new AbortController(),
      b = new AbortController(),
      d = requestDeadline(120_000, [a.signal, b.signal]);
    [a, b][which]!.abort();
    expect(d.signal.aborted).toBe(true);
    d.dispose();
  });
  it("recognises already aborted signals", () => {
    const parent = new AbortController();
    parent.abort();
    const d = requestDeadline(30_000, [parent.signal]);
    expect(d.signal.aborted).toBe(true);
    d.dispose();
  });
  it("releases timers and listeners after success", () => {
    vi.useFakeTimers();
    const parent = new AbortController(),
      remove = vi.spyOn(parent.signal, "removeEventListener");
    const d = requestDeadline(30_000, [undefined, parent.signal]);
    d.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledTimes(1);
    parent.abort();
    expect(d.signal.aborted).toBe(false);
  });
});
