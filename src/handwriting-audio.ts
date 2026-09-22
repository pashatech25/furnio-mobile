/** Owner-supplied MP3, measured using afinfo. Animation uses decoded duration. */
export const pencilDurationMs = 2952;
export const pencilAudioMode = {
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  interruptionMode: "mixWithOthers" as const,
  allowsRecording: false,
};

type PencilPlayer = {
  isLoaded: boolean;
  duration: number;
  muted: boolean;
  volume: number;
  seekTo(seconds: number): Promise<void>;
  play(): void;
};

/** A blur/unmount during asynchronous setup must never start orphaned audio. */
export async function startPencilAudio(player: PencilPlayer, configure: () => Promise<void>, cancelled: () => boolean) {
  if (cancelled() || !player.isLoaded) return;
  await configure();
  if (cancelled()) return;
  await player.seekTo(0);
  if (cancelled()) return;
  player.muted = false;
  player.volume = 0.65;
  player.play();
}
