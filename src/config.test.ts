import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./config";
const staging = {
  mode: "staging",
  platform: "https://platform.staging.example",
  mobile: "https://mobile.staging.example",
  supabase: "https://db.staging.example",
  key: "sb_publishable_test_fixture",
};
describe("environment isolation", () => {
  it("defaults to an offline demo with empty service URLs", () =>
    expect(validateEnvironment({}).platform).toBe(""));
  it("accepts explicitly separate HTTPS staging", () =>
    expect(validateEnvironment(staging).mode).toBe("staging"));
  it.each([
    "platform.furnio.ai",
    "platform.furnio.io",
    "sgsjkgfwgxmlqcgyuyeh.supabase.co",
    "auth.furnio.ai",
  ])("rejects production host %s in staging", (host) =>
    expect(() =>
      validateEnvironment({ ...staging, platform: `https://${host}` }),
    ).toThrow(),
  );
  it.each([
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com?token=secret",
    "https://example.com#secret",
  ])("rejects unsafe endpoint %s", (mobile) =>
    expect(() => validateEnvironment({ ...staging, mobile })).toThrow(),
  );
  it.each(["sb_secret_fixture", "eyJlegacy.service.role", ""])(
    "rejects a secret, legacy token or missing key",
    (key) => expect(() => validateEnvironment({ ...staging, key })).toThrow(),
  );
  it("does not infer a production default", () =>
    expect(() => validateEnvironment({ mode: "production" })).toThrow());
});
