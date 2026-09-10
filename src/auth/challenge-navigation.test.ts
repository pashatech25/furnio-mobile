import { describe, expect, it } from "vitest";
import { allowChallengeNavigation } from "./challenge-navigation";

const owned = "https://furnio-mobile-staging.amidi-alipasha.workers.dev/v1/challenge?nonce=test";
describe("native challenge navigation", () => {
  it("loads only the owned challenge as the top-level page", () => {
    expect(allowChallengeNavigation(owned, { url: owned, isTopFrame: true })).toBe(true);
    for (const url of ["https://furnio.ai", "https://evil.test", "about:blank", "about:srcdoc", "https://challenges.cloudflare.com", owned.replace("/v1/challenge", "/other")])
      expect(allowChallengeNavigation(owned, { url, isTopFrame: true })).toBe(false);
  });
  it("permits Turnstile frames and their browser documents", () => {
    for (const url of ["https://challenges.cloudflare.com/path", "about:blank", "about:srcdoc"])
      expect(allowChallengeNavigation(owned, { url, isTopFrame: false })).toBe(true);
  });
  it("rejects foreign origins, insecure schemes and missing frame identity", () => {
    for (const url of ["https://challenges.cloudflare.com.evil.test", "http://challenges.cloudflare.com", "file:///tmp/file", "javascript:alert(1)"])
      expect(allowChallengeNavigation(owned, { url, isTopFrame: false })).toBe(false);
    expect(allowChallengeNavigation(owned, { url: "about:blank" })).toBe(false);
  });
});
