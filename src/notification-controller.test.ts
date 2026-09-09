import { describe, expect, it, vi } from "vitest";
import {
  createNotificationController,
  isFurnioActivityNotification,
  type NotificationState,
} from "./notification-controller";
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const fresh: NotificationState = {
  installationId: user,
  installationSecret: "a".repeat(64),
  revision: 0,
  userId: null,
  enabled: false,
  pendingDisable: false,
};
function fixture() {
  const local = {
    state: null as NotificationState | null,
    user: user as string | null,
  };
  const deps = {
    read: vi.fn(async () => local.state && { ...local.state }),
    write: vi.fn(async (state: NotificationState) => {
      local.state = { ...state };
    }),
    fresh: vi.fn(async () => ({ ...fresh })),
    currentUser: vi.fn(async () => local.user),
    permission: vi.fn(async () => true),
    register: vi.fn(async (_state: NotificationState, _userId: string) => ({
      enabled: true,
    })),
    disable: vi.fn(async (_state: NotificationState) => ({ enabled: false })),
  };
  return { local, deps, controller: createNotificationController(deps) };
}
describe("installation notification lifecycle", () => {
  it("does not ask permission or register on first launch", async () => {
    const { controller, deps } = fixture();
    expect(await controller.synchronize(user)).toBeNull();
    expect(deps.permission).not.toHaveBeenCalled();
  });
  it("reserves prepare/register/cleanup revisions before transport", async () => {
    const { controller, deps, local } = fixture();
    deps.register.mockImplementation(async (state) => {
      expect(state.revision).toBe(2);
      expect(local.state).toMatchObject({
        revision: 3,
        enabled: false,
        pendingDisable: true,
      });
      return { enabled: true };
    });
    await controller.enable(user);
    expect(local.state).toMatchObject({
      userId: user,
      enabled: true,
      pendingDisable: false,
    });
    expect(deps.permission).toHaveBeenCalledWith(true);
  });
  it("disables using a higher revision after an uncertain registration", async () => {
    const { controller, deps, local } = fixture();
    deps.register.mockRejectedValue(new Error("offline"));
    await expect(controller.enable(user)).rejects.toThrow("offline");
    await controller.synchronize(user);
    expect(deps.disable.mock.calls[0]![0].revision).toBeGreaterThan(
      deps.register.mock.calls[0]![0].revision,
    );
    expect(local.state).toMatchObject({
      enabled: false,
      userId: null,
      pendingDisable: false,
    });
  });
  it("does not transfer opt-in to a different customer", async () => {
    const { controller, deps, local } = fixture();
    await controller.enable(user);
    local.user = other;
    await controller.synchronize(other);
    expect(deps.register).toHaveBeenCalledTimes(1);
    expect(local.state).toMatchObject({ enabled: false, userId: null });
  });
  it("cleans up if the account changes during registration", async () => {
    const { controller, deps, local } = fixture();
    deps.register.mockImplementation(async () => {
      local.user = other;
      return { enabled: true };
    });
    await expect(controller.enable(user)).rejects.toThrow("account changed");
    expect(local.state?.enabled).toBe(false);
    expect(deps.disable).toHaveBeenCalledOnce();
  });
  it("keeps an offline sign-out cleanup journal and retries without auth", async () => {
    const { controller, deps, local } = fixture();
    await controller.enable(user);
    deps.disable.mockRejectedValueOnce(new Error("offline"));
    await expect(controller.disable()).rejects.toThrow("offline");
    const revision = local.state!.revision;
    expect(local.state).toMatchObject({ enabled: false, pendingDisable: true });
    local.user = null;
    await controller.synchronize(null);
    expect(deps.disable.mock.calls[1]![0].revision).toBe(revision);
    expect(local.state!.pendingDisable).toBe(false);
  });
  it("does not acknowledge a contradictory disable response", async () => {
    const { controller, deps, local } = fixture();
    await controller.enable(user);
    deps.disable.mockResolvedValue({ enabled: true });
    await expect(controller.disable()).rejects.toThrow("not been confirmed");
    expect(local.state?.pendingDisable).toBe(true);
  });
  it("renews opted-in installations without another permission prompt", async () => {
    const { controller, deps } = fixture();
    await controller.enable(user);
    await controller.synchronize(user);
    expect(deps.permission.mock.calls.map((v) => v[0])).toEqual([true, false]);
    expect(deps.register.mock.calls[1]![0].revision).toBeGreaterThan(
      deps.register.mock.calls[0]![0].revision,
    );
  });
  it("revoking system permission disables server delivery", async () => {
    const { controller, deps, local } = fixture();
    await controller.enable(user);
    deps.permission.mockResolvedValue(false);
    await controller.synchronize(user);
    expect(local.state!.enabled).toBe(false);
    expect(deps.disable).toHaveBeenCalledOnce();
  });
  it("serializes simultaneous toggles", async () => {
    const { controller, deps, local } = fixture();
    await Promise.all([controller.enable(user), controller.disable()]);
    expect(local.state!.enabled).toBe(false);
    expect(deps.disable.mock.calls[0]![0].revision).toBeGreaterThan(
      deps.register.mock.calls[0]![0].revision,
    );
  });
  it("rejects external deep links and extra data from notifications", () => {
    expect(
      isFurnioActivityNotification({ type: "furnio.activity", version: 1 }),
    ).toBe(true);
    for (const data of [
      null,
      { url: "https://evil.example" },
      { type: "furnio.activity", version: 1, jobId: other },
      { type: "furnio.activity", version: 2 },
    ])
      expect(isFurnioActivityNotification(data)).toBe(false);
  });
});
