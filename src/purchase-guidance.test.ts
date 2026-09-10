import { expect, it } from "vitest";
import { purchaseGuidance } from "./purchase-guidance";
it("explains Android website purchases without a clickable URL", () => {
  const copy = purchaseGuidance("android");
  expect(copy).toContain("furnio.ai");
  expect(copy).toContain("same Furnio account");
  expect(copy).not.toMatch(/https?:\/\//);
});
it("does not infer an eligible iOS storefront or direct Canadian users to checkout", () => {
  for (const platform of ["ios", "unknown"]) {
    expect(purchaseGuidance(platform)).not.toContain("furnio.ai");
    expect(purchaseGuidance(platform)).not.toContain("available through");
  }
});
