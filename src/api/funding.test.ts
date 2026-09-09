import { describe, expect, it } from "vitest";
import { canUseTrialPreview } from "./funding";
import type { Trial } from "./schemas";
const trial: Trial = {
  enabled: true,
  phoneVerified: true,
  state: "active",
  allowedServiceSlugs: ["virtual_staging", "twilight"],
  successfulOutputs: 0,
  successfulOutputLimit: 3,
  allowedCountryCodes: ["CA", "US"],
  phoneRequired: true,
  minimumResendSeconds: 60,
  expiresAt: null,
  turnstileSiteKey: null,
  unlockCredits: 5,
};
describe("trial and granted-credit presentation parity", () => {
  it.each([0, 1, 4])(
    "keeps an eligible trial available when %s credits cannot fund the job",
    (balance) =>
      expect(canUseTrialPreview(trial, "virtual_staging", balance, 5)).toBe(
        true,
      ),
  );
  it.each([5, 50])(
    "uses paid credits when an admin grant of %s can fund the job",
    (balance) =>
      expect(canUseTrialPreview(trial, "virtual_staging", balance, 5)).toBe(
        false,
      ),
  );
  it("does not guess trial availability while balance is loading", () =>
    expect(canUseTrialPreview(trial, "virtual_staging", null, 5)).toBe(false));
  it("does not extend a trial to an excluded service", () =>
    expect(canUseTrialPreview(trial, "reference_furniture", 0, 5)).toBe(false));
  it("respects disabled, unverified, expired and exhausted trials", () => {
    for (const changed of [
      { enabled: false },
      { phoneVerified: false },
      { state: "expired" as const },
      { successfulOutputs: 3 },
    ])
      expect(
        canUseTrialPreview({ ...trial, ...changed }, "twilight", 0, 5),
      ).toBe(false);
  });
});
