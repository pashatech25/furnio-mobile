import { describe, expect, it, vi } from "vitest";
import { createDevicePrivacyLifecycle } from "./device-privacy-lifecycle";
function setup() {
  const deps = {
    setOwner: vi.fn(async (_user: string | null) => {}),
    starting: vi.fn(),
    ready: vi.fn(),
    failed: vi.fn(),
  };
  return {
    deps,
    lifecycle: createDevicePrivacyLifecycle<{ id: string }>(deps),
  };
}
describe("private device lifecycle", () => {
  it("waits for cleanup before rendering an account", async () => {
    const { deps, lifecycle } = setup();
    let finish: (() => void) | undefined;
    deps.setOwner.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = lifecycle.accept({ id: "A" });
    expect(deps.starting).toHaveBeenCalledOnce();
    expect(deps.ready).not.toHaveBeenCalled();
    finish!();
    await pending;
    expect(deps.ready).toHaveBeenCalledWith({ id: "A" });
  });
  it("does not remount or clean drafts on repeated same-account auth events", async () => {
    const { deps, lifecycle } = setup();
    await lifecycle.accept({ id: "A" });
    await lifecycle.accept({ id: "A" });
    expect(deps.starting).toHaveBeenCalledOnce();
    expect(deps.setOwner).toHaveBeenCalledOnce();
  });
  it("ignores stale completion when an account switch races cleanup", async () => {
    const { deps, lifecycle } = setup();
    let finish: (() => void) | undefined;
    deps.setOwner.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const a = lifecycle.accept({ id: "A" });
    await lifecycle.accept({ id: "B" });
    finish!();
    await a;
    expect(deps.ready.mock.calls).toEqual([[{ id: "B" }]]);
  });
  it("keeps cleanup failure visible but preserves the current privacy identity", async () => {
    const { deps, lifecycle } = setup();
    deps.setOwner.mockRejectedValueOnce(new Error("device locked"));
    await lifecycle.accept({ id: "A" });
    expect(deps.failed).toHaveBeenCalledWith({ id: "A" });
    expect(deps.ready).not.toHaveBeenCalled();
    await lifecycle.accept({ id: "A" });
    expect(deps.ready).toHaveBeenCalledWith({ id: "A" });
    expect(deps.setOwner).toHaveBeenCalledTimes(2);
  });
  it("cleans a signed-out launch and ignores completions after unmount", async () => {
    const { deps, lifecycle } = setup();
    await lifecycle.accept(null);
    expect(deps.setOwner).toHaveBeenCalledWith(null);
    let finish: (() => void) | undefined;
    deps.setOwner.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const a = lifecycle.accept({ id: "A" });
    lifecycle.dispose();
    finish!();
    await a;
    await lifecycle.accept({ id: "B" });
    expect(deps.ready.mock.calls).toEqual([[null]]);
    expect(deps.setOwner).toHaveBeenCalledTimes(2);
  });
});
