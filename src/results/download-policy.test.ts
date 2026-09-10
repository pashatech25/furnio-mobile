import { expect, it } from "vitest";
import { resultDownloadPath } from "./download-policy";
it("uses only the watermarked preview route for locked trial results", () => {
  expect(resultDownloadPath("selected-output", "trial_locked")).toBe("/api/assets/selected-output/preview");
});
it("preserves the clean download route for paid or unlocked results", () => {
  expect(resultDownloadPath("selected-output", "paid")).toBe("/api/assets/selected-output/download");
});
