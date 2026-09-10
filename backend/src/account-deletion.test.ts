import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import { reviewAccountDeletion } from "./account-deletion";
import { requireRecentAccountAuth } from "./recent-auth";
import { accountPrivacyLimitFixture } from "../tests/account-rate-limit-fixture";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const base = "https://abcdefghijklmnopqrst.supabase.co";
const seconds = Math.floor(Date.now() / 1000);
const environment = {
  ...accountPrivacyLimitFixture(),
  ENVIRONMENT: "staging",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_URL: base,
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture_only",
  MOBILE_ACCOUNT_REVIEW_ENABLED: "true",
  MOBILE_ENABLED: "false",
};
// Tests inject a mocked Auth verifier. Synthetic JWT signatures are never
// accepted by deployed Auth; the Worker cannot authenticate with decoding alone.
function token(overrides: Record<string, unknown> = {}, algorithm = "ES256") {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: algorithm })}.${encode({
    sub: userId,
    session_id: sessionId,
    iss: `${base}/auth/v1`,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: false,
    aal: "aal1",
    iat: seconds,
    exp: seconds + 3600,
    amr: [{ method: "password", timestamp: seconds - 30 }],
    ...overrides,
  })}.fixture_signature`;
}
function request(jwt = token(), suffix = "") {
  return new Request(
    `https://mobile.test/v1/account/deletion/review${suffix}`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "CF-Connecting-IP": "192.0.2.1",
      },
    },
  );
}
const review = {
  version: 1,
  scope: "shared_furnio_account",
  canRequestDeletion: false,
  accountAccess: "active",
  counts: { projects: 3, storedAssets: 9, unfinishedJobs: 1 },
  subscriptions: [
    {
      provider: "app_store",
      context: "customer",
      count: 1,
      renewalNotCancelled: 1,
    },
  ],
  hasDeveloperWorkspace: false,
  hasAdministratorRole: false,
  linkedProviders: ["email"],
};
function goodAuth() {
  return Response.json({
    id: userId,
    is_anonymous: false,
    email: "private@example.invalid",
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("recent shared-account authentication", () => {
  it("verifies the same token at Auth, then returns only scoped identity proof", async () => {
    const fetcher = vi.fn(async () => goodAuth());
    const jwt = token();
    expect(
      await requireRecentAccountAuth(
        request(jwt),
        environment,
        fetcher,
        seconds * 1000,
      ),
    ).toEqual({
      userId,
      sessionId,
      authenticatedAt: new Date((seconds - 30) * 1000).toISOString(),
      authenticationMethod: "password",
      assurance: "aal1",
    });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      `${base}/auth/v1/user`,
      expect.objectContaining({
        headers: {
          apikey: "sb_secret_fixture_only",
          Authorization: `Bearer ${jwt}`,
          Accept: "application/json",
        },
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it.each([
    ["expired", { exp: seconds }],
    ["future issued", { iat: seconds + 31 }],
    ["wrong issuer", { iss: "https://foreign.invalid/auth/v1" }],
    ["wrong audience", { aud: "other" }],
    ["service role", { role: "service_role" }],
    ["anonymous", { is_anonymous: true }],
    ["missing session", { session_id: undefined }],
    ["missing AMR", { amr: undefined }],
    [
      "freshly refreshed, old authentication",
      { amr: [{ method: "password", timestamp: seconds - 300 }] },
    ],
    [
      "future authentication",
      { amr: [{ method: "oauth", timestamp: seconds + 31 }] },
    ],
    ["recovery-only", { amr: [{ method: "recovery", timestamp: seconds }] }],
    [
      "user-metadata spoof",
      {
        amr: [],
        user_metadata: { amr: [{ method: "oauth", timestamp: seconds }] },
      },
    ],
    ["invalid assurance", { aal: "admin" }],
  ])("rejects %s before fetching", async (_label, overrides) => {
    const fetcher = vi.fn(async () => goodAuth());
    await expect(
      requireRecentAccountAuth(
        request(token(overrides)),
        environment,
        fetcher,
        seconds * 1000,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["none", "HS256"])(
    "rejects unsupported %s JWT algorithm",
    async (algorithm) => {
      const fetcher = vi.fn(async () => goodAuth());
      await expect(
        requireRecentAccountAuth(
          request(token({}, algorithm)),
          environment,
          fetcher,
          seconds * 1000,
        ),
      ).rejects.toMatchObject({ status: 401 });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("does not use a newer unknown AMR or refresh as proof", async () => {
    const verified = await requireRecentAccountAuth(
      request(
        token({
          amr: [
            { method: "unknown", timestamp: seconds },
            { method: "oauth", timestamp: seconds - 10 },
          ],
        }),
      ),
      environment,
      async () => goodAuth(),
      seconds * 1000,
    );
    expect(verified.authenticationMethod).toBe("oauth");
    expect(verified.authenticatedAt).toBe(
      new Date((seconds - 10) * 1000).toISOString(),
    );
  });
  it("never trusts a decoded JWT rejected by Auth", async () => {
    await expect(
      requireRecentAccountAuth(
        request(),
        environment,
        async () =>
          Response.json({ message: "signature rejected" }, { status: 401 }),
        seconds * 1000,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it.each([
    { id: sessionId, is_anonymous: false },
    { id: userId, is_anonymous: true },
    { id: userId, is_anonymous: false, deleted_at: new Date().toISOString() },
  ])("rejects incompatible verified user %o", async (body) => {
    await expect(
      requireRecentAccountAuth(
        request(),
        environment,
        async () => Response.json(body),
        seconds * 1000,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("fails closed during Auth outage without returning provider error details", async () => {
    await expect(
      requireRecentAccountAuth(
        request(),
        environment,
        async () => {
          throw new Error("secret in provider error");
        },
        seconds * 1000,
      ),
    ).rejects.toMatchObject({
      status: 503,
      message: "Account security is temporarily unavailable.",
    });
  });
  it("rejects staging aimed at production or an unapproved origin", async () => {
    const fetcher = vi.fn(async () => goodAuth());
    for (const env of [
      { ...environment, SUPABASE_URL: "https://foreign.invalid" },
      {
        ...environment,
        SUPABASE_URL: "https://sgsjkgfwgxmlqcgyuyeh.supabase.co",
        SUPABASE_PROJECT_REF: "sgsjkgfwgxmlqcgyuyeh",
      },
      { ...environment, ENVIRONMENT: "unknown" },
    ])
      await expect(
        requireRecentAccountAuth(request(), env, fetcher, seconds * 1000),
      ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("read-only deletion review", () => {
  it("has an independent disabled-by-default gate, before all network access", async () => {
    const fetcher = vi.fn(async () => goodAuth());
    await expect(
      reviewAccountDeletion(
        request(),
        { ...environment, MOBILE_ACCOUNT_REVIEW_ENABLED: "false" },
        fetcher,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    "?userId=other",
    "?sessionId=other",
    "?environment=PRODUCTION",
    "?delete=true",
  ])("rejects query parameters %s", async (query) => {
    const fetcher = vi.fn(async () => goodAuth());
    await expect(
      reviewAccountDeletion(request(token(), query), environment, fetcher),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("only reads the verified account/session, with no supplied identity or destructive calls", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(goodAuth())
      .mockResolvedValueOnce(Response.json(review));
    expect(
      await reviewAccountDeletion(request(), environment, fetcher),
    ).toEqual(review);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[1]!;
    expect(url).toBe(`${base}/rest/v1/rpc/get_mobile_account_deletion_review`);
    expect(JSON.parse(String(init?.body))).toEqual({
      p_user: userId,
      p_session: sessionId,
      p_authenticated_at: new Date((seconds - 30) * 1000).toISOString(),
      p_authentication_method: "password",
      p_assurance: "aal1",
      p_environment: "SANDBOX",
    });
  });
  it("rate-limits review before Auth and SQL when the source counter denies access", async () => {
    const fetcher = vi.fn(async () => goodAuth());
    await expect(
      reviewAccountDeletion(
        request(),
        {
          ...environment,
          ACCOUNT_DELETION_SOURCE_LIMIT: {
            limit: async () => ({ success: false }),
          },
        },
        fetcher,
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rate-limits a verified account before the review SQL read", async () => {
    const fetcher = vi.fn(async () => goodAuth());
    await expect(
      reviewAccountDeletion(
        request(),
        {
          ...environment,
          ACCOUNT_DELETION_USER_LIMIT: {
            limit: async () => ({ success: false }),
          },
        },
        fetcher,
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe(`${base}/auth/v1/user`);
  });
  it("rejects a revoked session reported by the database after Auth verification", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(goodAuth())
      .mockResolvedValueOnce(
        Response.json(
          { code: "42501", message: "private SQL user identifier" },
          { status: 403 },
        ),
      );
    await expect(
      reviewAccountDeletion(request(), environment, fetcher),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Account deletion review could not be verified. Sign in again and retry.",
    });
  });
  it("cannot be turned into a deletion capability by a mismatched response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(goodAuth())
      .mockResolvedValueOnce(
        Response.json({ ...review, canRequestDeletion: true }),
      );
    await expect(
      reviewAccountDeletion(request(), environment, fetcher),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("can review a suspended account even during app-entry rollback, without the platform access gate", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(goodAuth())
      .mockResolvedValueOnce(
        Response.json({ ...review, accountAccess: "suspended" }),
      );
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(request(), environment);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      accountAccess: "suspended",
      canRequestDeletion: false,
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("still rejects browser access and the unimplemented destructive endpoint", async () => {
    const fetcher = vi.fn(async () => goodAuth());
    vi.stubGlobal("fetch", fetcher);
    const browser = request();
    browser.headers.set("Origin", "https://furnio.ai");
    expect((await worker.fetch(browser, environment)).status).toBe(403);
    expect(
      (
        await worker.fetch(
          new Request("https://mobile.test/v1/account/delete", {
            method: "POST",
          }),
          environment,
        )
      ).status,
    ).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
