import { describe, expect, it, vi } from "vitest";
import { pencilAudioMode, pencilDurationMs, startPencilAudio } from "./handwriting-audio";

const player = () => ({ isLoaded: true, duration: 2.952, muted: true, volume: 0,
  seekTo: vi.fn(async (_seconds: number) => {}), play: vi.fn() });

describe("pencil handwriting playback", () => {
  it("uses the supplied clip duration and media audio without microphone/background access", () => {
    expect(pencilDurationMs).toBe(2952);
    expect(pencilAudioMode).toEqual({ playsInSilentMode: true, shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers", allowsRecording: false });
  });
  it("configures, rewinds, unmutes and plays in order", async () => {
    const sound = player(), configure = vi.fn(async () => {});
    await startPencilAudio(sound, configure, () => false);
    expect(configure).toHaveBeenCalledOnce();
    expect(sound.seekTo).toHaveBeenCalledWith(0);
    expect(sound.muted).toBe(false);
    expect(sound.volume).toBe(0.65);
    expect(sound.play).toHaveBeenCalledOnce();
    expect(configure.mock.invocationCallOrder[0]).toBeLessThan(sound.seekTo.mock.invocationCallOrder[0]!);
    expect(sound.seekTo.mock.invocationCallOrder[0]).toBeLessThan(sound.play.mock.invocationCallOrder[0]!);
  });
  it("can play after a late asset load instead of permanently skipping the clip", async () => {
    const sound = player(), configure = vi.fn(async () => {});
    sound.isLoaded = false;
    await startPencilAudio(sound, configure, () => false);
    expect(sound.play).not.toHaveBeenCalled();
    sound.isLoaded = true;
    await startPencilAudio(sound, configure, () => false);
    expect(sound.play).toHaveBeenCalledOnce();
  });
  it.each(["configure", "seek"])("does not play after blurring during %s", async phase => {
    const sound = player();
    let cancelled = false;
    const configure = async () => { if (phase === "configure") cancelled = true; };
    sound.seekTo.mockImplementation(async () => { if (phase === "seek") cancelled = true; });
    await startPencilAudio(sound, configure, () => cancelled);
    expect(sound.play).not.toHaveBeenCalled();
  });
});
