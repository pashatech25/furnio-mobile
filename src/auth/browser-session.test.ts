import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  platform: { OS: "android" },
  browser: vi.fn(),
  listen: vi.fn(),
  remove: vi.fn(),
  listener: null as null | ((event: { url: string }) => void),
}));
vi.mock("react-native", () => ({ Platform: f.platform }));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: f.browser }));
vi.mock("expo-linking", () => ({ addEventListener: f.listen }));
import { matchesAuthReturn, openNativeAuthSession } from "./browser-session";
const start = "https://auth.example.invalid/authorize";
const expected = "furnio://auth/deletion-callback?flow=current";
const returned = "furnio://auth/deletion-callback?code=fixture&flow=current&sb_flow_id=pkce";
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  f.platform.OS = "android";
  f.listener = null;
  f.listen.mockImplementation((_type, listener) => {
    f.listener = listener;
    return { remove: f.remove };
  });
});
afterEach(() => { vi.useRealTimers(); });
describe("Android browser return coordination", () => {
  it("keeps iOS's exact existing two-argument browser call and result", async () => {
    f.platform.OS = "ios";
    f.browser.mockResolvedValue({ type: "cancel" });
    expect(await openNativeAuthSession(start, expected)).toEqual({ type: "cancel" });
    expect(f.browser).toHaveBeenCalledWith(start, expected);
    expect(f.listen).not.toHaveBeenCalled();
  });
  it("registers before opening, accepts reordered query keys, and handles return-before-resume", async () => {
    let dismiss!: (result: { type: string }) => void;
    f.browser.mockImplementation(() => {
      expect(f.listener).not.toBeNull();
      return new Promise(resolve => { dismiss = resolve; });
    });
    const pending = openNativeAuthSession(start, expected);
    f.listener!({ url: returned });
    expect(await pending).toEqual({ type: "success", url: returned });
    dismiss({ type: "dismiss" });
    await Promise.resolve();
    expect(f.remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("waits for the deep link when Android resumes before delivering it", async () => {
    f.browser.mockResolvedValue({ type: "dismiss" });
    const pending = openNativeAuthSession(start, expected);
    await vi.advanceTimersByTimeAsync(200);
    f.listener!({ url: returned });
    expect(await pending).toEqual({ type: "success", url: returned });
    expect(f.remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("returns genuine cancellation after a bounded wait and removes its listener", async () => {
    f.browser.mockResolvedValue({ type: "cancel" });
    const pending = openNativeAuthSession(start, expected);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toEqual({ type: "cancel" });
    expect(f.remove).toHaveBeenCalledOnce();
  });
  it("cleans up if launching the browser fails", async () => {
    f.browser.mockRejectedValue(new Error("No browser"));
    await expect(openNativeAuthSession(start, expected)).rejects.toThrow("No browser");
    expect(f.remove).toHaveBeenCalledOnce();
  });
  it.each([
    returned.replace("furnio:", "other:"),
    returned.replace("auth/", "evil/"),
    returned.replace("deletion-callback", "callback"),
    returned.replace("flow=current", "flow=other"),
    returned + "&flow=other",
    returned.replace("//auth", "//attacker@auth"),
    "not-a-url",
  ])("rejects a foreign, stale, or ambiguous return: %s", (url) => {
    expect(matchesAuthReturn(url, expected)).toBe(false);
  });
});
