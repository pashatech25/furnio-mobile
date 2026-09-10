import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { boundedJson, requireCustomer } from "./index";
import { accountPrivacyLimitFixture } from "../tests/account-rate-limit-fixture";
const userId = "11111111-1111-4111-8111-111111111111";
function environment(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "staging",
    MOBILE_ENABLED: "false",
    TURNSTILE_SITE_KEY: "",
    CHALLENGE_HOSTNAME: "",
    PLATFORM: {
      fetch: vi.fn(async () => Response.json({ user: { userId } })),
      connect: () => {
        throw new Error("TCP is not used");
      },
    },
    ...overrides,
  };
}
afterEach(() => vi.restoreAllMocks());
describe("isolated mobile Worker", () => {
  it("reports every unfinished capability as unavailable", async () => {
    const response = await worker.fetch(
      new Request("https://mobile.test/v1/capabilities"),
      environment(),
    );
    expect(await response.json()).toEqual({
      version: 1,
      commerceReady: false,
      recoveryReady: false,
      billingReady: false,
      activityReady: false,
      notificationsReady: false,
      accountDeletionReady: false,
      accountDeletionReviewReady: false,
      accountDeletionRequestsReady: false,
    });
  });
  it("exposes privacy review independently without enabling destructive deletion", async () => {
    const response = await worker.fetch(
      new Request("https://mobile.test/v1/capabilities"),
      environment({
        ...accountPrivacyLimitFixture(),
        MOBILE_ACCOUNT_REVIEW_ENABLED: "true",
        MOBILE_ACCOUNT_REQUESTS_ENABLED: "true",
        MOBILE_ENABLED: "false",
      }),
    );
    expect(await response.json()).toMatchObject({
      accountDeletionReviewReady: true,
      accountDeletionRequestsReady: true,
      accountDeletionReady: false,
    });
  });
  it("cannot be tricked into an enabled commerce capability by a query", async () => {
    const response = await worker.fetch(
      new Request("https://mobile.test/v1/capabilities?commerceReady=true"),
      environment({ MOBILE_ENABLED: "true" }),
    );
    expect(await response.json()).toMatchObject({ commerceReady: false });
  });
  it("does not advertise account privacy readiness without abuse protection", async () => {
    const response = await worker.fetch(
      new Request("https://mobile.test/v1/capabilities"),
      environment({
        MOBILE_ACCOUNT_REVIEW_ENABLED: "true",
        MOBILE_ACCOUNT_REQUESTS_ENABLED: "true",
      }),
    );
    expect(await response.json()).toMatchObject({
      accountDeletionReviewReady: false,
      accountDeletionRequestsReady: false,
      accountDeletionReady: false,
    });
  });
  it("disables private endpoints before contacting the platform", async () => {
    const env = environment();
    expect(
      (await worker.fetch(new Request("https://mobile.test/v1/session"), env))
        .status,
    ).toBe(503);
    expect(env.PLATFORM.fetch).not.toHaveBeenCalled();
  });
  it("rejects browser-origin access", async () =>
    expect(
      (
        await worker.fetch(
          new Request("https://mobile.test/v1/capabilities", {
            headers: { Origin: "https://foreign.test" },
          }),
          environment(),
        )
      ).status,
    ).toBe(403));
  it("requires a bearer token for customer identity", async () => {
    const env = environment({ MOBILE_ENABLED: "true" });
    await expect(
      requireCustomer(new Request("https://mobile.test"), env),
    ).rejects.toMatchObject({ status: 401 });
    expect(env.PLATFORM.fetch).not.toHaveBeenCalled();
  });
  it("uses the existing customer authorization gate, not a supplied user ID", async () => {
    const env = environment();
    const id = await requireCustomer(
      new Request("https://mobile.test?userId=other", {
        headers: { Authorization: "Bearer this-is-only-a-test-token" },
      }),
      env,
    );
    expect(id).toBe(userId);
    expect(env.PLATFORM.fetch).toHaveBeenCalledWith(
      "https://platform.internal/api/me",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer this-is-only-a-test-token",
          Accept: "application/json",
        },
        redirect: "manual",
      }),
    );
  });
  it("rejects a customer denied by the existing API", async () => {
    const env = environment({
      PLATFORM: {
        fetch: vi.fn(async () => new Response(null, { status: 403 })),
        connect: () => {
          throw new Error("unused");
        },
      },
    });
    await expect(
      requireCustomer(
        new Request("https://mobile.test", {
          headers: { Authorization: "Bearer this-is-only-a-test-token" },
        }),
        env,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("bounds upstream responses", async () =>
    await expect(
      boundedJson(new Response("x".repeat(200)), 100),
    ).rejects.toMatchObject({ status: 502 }));
  it.each([301, 302, 303, 307, 308])(
    "rejects an authorization redirect (%s) without following it",
    async (status) => {
      const env = environment();
      const fetcher = vi.fn<typeof fetch>(
        async () =>
          new Response(null, {
            status,
            headers: { Location: "https://foreign.invalid" },
          }),
      );
      env.PLATFORM.fetch = fetcher;
      await expect(
        requireCustomer(
          new Request("https://mobile.test", {
            headers: { Authorization: "Bearer this-is-only-a-test-token" },
          }),
          env,
        ),
      ).rejects.toMatchObject({ status: 502 });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("manual");
    },
  );
  it("rejects a malformed challenge nonce", async () =>
    expect(
      (
        await worker.fetch(
          new Request("https://mobile.test/v1/challenge?nonce=%3Cscript%3E"),
          environment({ MOBILE_ENABLED: "true" }),
        )
      ).status,
    ).toBe(400));
  it("serves the challenge only on the configured secure hostname", async () => {
    const env = environment({
      MOBILE_ENABLED: "true",
      TURNSTILE_SITE_KEY: "test_public_site_key",
      CHALLENGE_HOSTNAME: "mobile.test",
    });
    const response = await worker.fetch(
      new Request(`https://mobile.test/v1/challenge?nonce=${userId}`),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'none'",
    );
    expect(await response.text()).toContain('action:"trial-phone"');
    const foreign = await worker.fetch(
      new Request(`https://other.test/v1/challenge?nonce=${userId}`),
      env,
    );
    expect(foreign.status).toBe(503);
  });
  it.each(["signup-email", "signin-email", "password-reset"])("supports real Auth challenge %s", async (action) => {
    const response = await worker.fetch(new Request(`https://mobile.test/v1/challenge?nonce=${userId}&action=${action}`), environment({ MOBILE_ENABLED: "true", TURNSTILE_SITE_KEY: "test_public_site_key", CHALLENGE_HOSTNAME: "mobile.test" }));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain(`action:"${action}"`);
    expect(body).toContain("expired-callback");
  });
  it("rejects arbitrary challenge actions", async () => {
    const response = await worker.fetch(new Request(`https://mobile.test/v1/challenge?nonce=${userId}&action=other`), environment({ MOBILE_ENABLED: "true" }));
    expect(response.status).toBe(400);
  });
  it("does not log customer identity, token, path or query", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await worker.fetch(
      new Request("https://mobile.test/v1/session?phone=PRIVATE", {
        headers: { Authorization: "Bearer very-private-test-token" },
      }),
      environment({ MOBILE_ENABLED: "true" }),
    );
    const output = JSON.stringify(log.mock.calls);
    expect(output).not.toContain("PRIVATE");
    expect(output).not.toContain("very-private");
    expect(output).not.toContain(userId);
    expect(output).not.toContain("/v1/session");
  });
});
