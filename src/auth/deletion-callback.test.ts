import { describe, expect, it, vi } from "vitest";
import {
  finishDeletionCallback,
  registerDeletionCallback,
  validateDeletionCallback,
} from "./deletion-callback";
const expected = "furnio://auth/deletion-callback?flow=private-fixture";
describe("isolated privacy OAuth callback", () => {
  it("accepts the exact endpoint and matching flow with the SDK PKCE flow selector", () => {
    expect(
      validateDeletionCallback(
        `${expected}&code=fixture-code&sb_flow_id=pkce-fixture`,
        expected,
      ),
    ).toEqual({ code: "fixture-code", flowId: "pkce-fixture" });
  });
  it.each([
    "furnio://auth/callback?flow=private-fixture&code=fixture",
    "other://auth/deletion-callback?flow=private-fixture&code=fixture",
    "furnio://evil/deletion-callback?flow=private-fixture&code=fixture",
    `${expected}&code=fixture#access_token=secret`,
    `${expected}&code=one&code=two`,
    `${expected}&flow=other&code=fixture`,
    `${expected}&code=fixture&access_token=secret`,
    "furnio://auth/deletion-callback?flow=wrong&code=fixture",
    expected,
  ])("rejects unrelated, token-bearing or ambiguous callbacks: %s", (url) => {
    expect(() => validateDeletionCallback(url, expected)).toThrow();
  });
  it("only delivers to a still-open in-memory flow and removes it on disposal", async () => {
    const callback = vi.fn(async () => undefined);
    const remove = registerDeletionCallback("private-fixture", callback);
    await finishDeletionCallback(`${expected}&code=fixture`);
    expect(callback).toHaveBeenCalledOnce();
    remove();
    await expect(
      finishDeletionCallback(`${expected}&code=fixture`),
    ).rejects.toThrow("expired");
  });
});
