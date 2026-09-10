/** Expo owns the player's release; it may run before our effect cleanup. */
export function stopOptionalAudio(player: { pause(): void }) {
  try { player.pause(); } catch {
    // A released decorative player must never crash navigation or authentication.
  }
}
