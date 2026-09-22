import { describe, expect, it } from "vitest";
import { androidCallbackDestination } from "./android-callback";
const ready = { complete: true, loading: false, signedIn: true, recovery: false,
  trial: { phoneRequired: true, phoneVerified: true } };
describe("Android post-auth handoff", () => {
  it("waits for exchange, account hydration and server rules", () => {
    for (const change of [{ complete: false }, { loading: true }, { signedIn: false }, { trial: null }])
      expect(androidCallbackDestination({ ...ready, ...change })).toBeNull();
  });
  it("opens the dashboard for a verified account", () => {
    expect(androidCallbackDestination(ready)).toBe("/(tabs)");
  });
  it("requires the existing SMS screen for a new unverified signup", () => {
    expect(androidCallbackDestination({ ...ready, trial: { phoneRequired: true, phoneVerified: false } })).toBe("/verify");
  });
  it("honors a server-authorized phone exemption, not a client bypass", () => {
    expect(androidCallbackDestination({ ...ready, trial: { phoneRequired: false, phoneVerified: false } })).toBe("/(tabs)");
  });
  it("keeps password recovery separate from customer navigation", () => {
    expect(androidCallbackDestination({ ...ready, recovery: true, trial: null })).toBe("/reset-password");
  });
});
