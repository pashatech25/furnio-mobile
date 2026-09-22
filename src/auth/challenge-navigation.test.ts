import { describe, expect, it } from "vitest";
import { allowChallengeMessageSource, allowChallengeNavigation } from "./challenge-navigation";

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

describe("native challenge message source", () => {
  const origin = new URL(owned).origin;
  it("accepts Android WebMessageListener's origin-only source", () => {
    expect(allowChallengeMessageSource(owned, origin, "android")).toBe(true);
    expect(allowChallengeMessageSource(owned, `${origin}/`, "android")).toBe(true);
  });
  it("keeps accepting full challenge URLs for iOS and legacy Android", () => {
    for (const platform of ["ios", "android"])
      expect(allowChallengeMessageSource(owned, owned, platform)).toBe(true);
  });
  it("does not relax iOS to accept an origin-only source", () => {
    expect(allowChallengeMessageSource(owned, origin, "ios")).toBe(false);
    expect(allowChallengeMessageSource(owned, `${origin}/`, "ios")).toBe(false);
  });
  it("rejects foreign frames, wrong paths and disguised origin-only sources", () => {
    for (const source of [
      "https://challenges.cloudflare.com", "https://evil.test/v1/challenge",
      "about:blank", "null", "", origin.replace("https:", "http:"),
      `${origin}.evil.test`, `${origin}/other`, `${origin}/?nonce=test`,
      `${origin}/#fragment`, owned.replace("https://", "https://user@"),
    ]) {
      for (const platform of ["android", "ios"])
        expect(allowChallengeMessageSource(owned, source, platform)).toBe(false);
    }
  });
});
