import { afterEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ OS: "ios" }));
vi.mock("react-native", () => ({ Platform: platform }));

afterEach(() => {
  platform.OS = "ios";
  vi.resetModules();
});

describe("native commerce platform boundary", () => {
  it.each([
    ["ios", true],
    ["android", false],
    ["web", false],
  ])("permits commerce only on iOS: %s", async (os, allowed) => {
    platform.OS = os;
    vi.resetModules();
    const { nativeCommerceAllowed } = await import("./commerce-policy");
    expect(nativeCommerceAllowed).toBe(allowed);
  });
});
