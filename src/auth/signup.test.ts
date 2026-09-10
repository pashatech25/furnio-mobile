import { describe, expect, it } from "vitest";
import { signupInput } from "./signup";
const input = { name: " Test customer ", email: " test@example.com ", password: "test-password-only", termsAccepted: true, marketingAccepted: false };
describe("customer registration", () => {
  it("sends the same consent fields as web, with marketing off by default", () => {
    const result = signupInput(input, "furnio://auth/callback", "fresh-captcha-token");
    expect(result.email).toBe("test@example.com");
    expect(result.options).toMatchObject({ captchaToken: "fresh-captcha-token", emailRedirectTo: "furnio://auth/callback", data: { full_name: "Test customer", furnio_terms_accepted: true, furnio_marketing_consent: false, furnio_terms_version: "2026-08-30" } });
    expect(result.options.data).not.toHaveProperty("phone_verified");
    expect(result.options.data).not.toHaveProperty("role");
  });
  it.each([
    [{ termsAccepted: false }, /Accept the Terms/],
    [{ password: "short" }, /eight characters/],
    [{ name: " " }, /Enter your name/],
    [{ email: "not-an-email" }, /valid email/],
  ])("rejects incomplete registration %j", (override, error) => {
    expect(() => signupInput({ ...input, ...override }, "furnio://auth/callback")).toThrow(error);
  });
});
