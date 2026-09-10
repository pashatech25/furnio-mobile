import { describe, expect, it, vi } from "vitest";
import { stopOptionalAudio } from "./audio-cleanup";

describe("optional handwriting audio cleanup", () => {
  it("pauses a live player on blur/background", () => {
    const player = { pause: vi.fn() };
    stopOptionalAudio(player);
    expect(player.pause).toHaveBeenCalledOnce();
  });
  it("does not throw when Expo has already released the native player", () => {
    const player = { pause() { throw new Error("Native shared object was released"); } };
    expect(() => stopOptionalAudio(player)).not.toThrow();
    expect(() => stopOptionalAudio(player)).not.toThrow();
  });
});
