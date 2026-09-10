import { expect, it } from "vitest";
import { shouldRefreshAccount } from "./account-refresh";
it("refreshes server allowance on completion and released reservations", () => {
  for (const status of ["succeeded", "partial", "failed", "cancelled"] as const)
    expect(shouldRefreshAccount(status)).toBe(true);
});
it("does not trigger an account reload on each running job poll", () => {
  expect(shouldRefreshAccount("queued")).toBe(false);
  expect(shouldRefreshAccount("running")).toBe(false);
});
