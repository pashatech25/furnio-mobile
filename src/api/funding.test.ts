import { describe, expect, it } from "vitest";
import { canUseTrialPreview, isServiceLocked, trialRemaining, hasServiceCredits } from "./funding";
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
  it("shows three previews separately from a zero-credit wallet", () => {
    expect(trialRemaining(trial)).toBe(3);
    expect(trialRemaining({ ...trial, successfulOutputs: 2 })).toBe(1);
    expect(hasServiceCredits(0, 5)).toBe(false);
  });
  it("only unlocks Admin-selected trial services at zero balance", () => {
    expect(isServiceLocked(trial, "virtual_staging", 0, 5)).toBe(false);
    expect(isServiceLocked(trial, "twilight", 0, 5)).toBe(false);
    for (const slug of ["item_removal", "custom_staging", "multiview", "winter_to_summer", "exterior_enhancement", "floor_plan", "reference_furniture"]) expect(isServiceLocked(trial, slug, 0, 5)).toBe(true);
    expect(isServiceLocked({ ...trial, allowedServiceSlugs: ["twilight"] }, "virtual_staging", 0, 5)).toBe(true);
  });
  it("keeps Admin-granted credits usable without lifting unrelated insufficient-credit locks", () => {
    expect(isServiceLocked(trial, "reference_furniture", 50, 20)).toBe(false);
    expect(isServiceLocked(trial, "reference_furniture", 5, 20)).toBe(true);
  });
  it("locks exhausted, expired and suspended trials unless credits cover the service", () => {
    for (const state of ["exhausted", "expired", "suspended"] as const) {
      expect(isServiceLocked({ ...trial, state }, "twilight", 0, 5)).toBe(true);
      expect(isServiceLocked({ ...trial, state }, "twilight", 50, 5)).toBe(false);
    }
    expect(isServiceLocked({ ...trial, successfulOutputs: 3 }, "twilight", 0, 5)).toBe(true);
    expect(isServiceLocked(null, "twilight", 0, 5)).toBe(true);
    expect(isServiceLocked(trial, "twilight", null, 5)).toBe(true);
    expect(isServiceLocked({ ...trial, phoneVerified: false }, "twilight", 0, 5)).toBe(true);
  });
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
