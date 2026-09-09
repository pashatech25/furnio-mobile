import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import { manageAccountDeletionRequest } from "./account-deletion";
import { requireRecentAccountAuth } from "./recent-auth";
vi.mock("./recent-auth", () => ({ requireRecentAccountAuth: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const session = "33333333-3333-4333-8333-333333333333";
const secret = "9d".repeat(32);
const env = {
  ENVIRONMENT: "staging",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture",
  MOBILE_ACCOUNT_REQUESTS_ENABLED: "true",
  MOBILE_ENABLED: "false",
};
const status = {
  version: 1,
  requestId: id,
  state: "prepared",
  createdAt: "2026-09-09T08:00:00Z",
  expiresAt: "2026-09-09T08:04:30Z",
  confirmedAt: null,
};
const review = {
  version: 1,
  scope: "shared_furnio_account",
  canRequestDeletion: false,
  accountAccess: "active",
  counts: { projects: 1, storedAssets: 2, unfinishedJobs: 0 },
  subscriptions: [],
  hasDeveloperWorkspace: false,
  hasAdministratorRole: false,
  linkedProviders: ["email"],
};
const prepared = {
  ...status,
  challenge: session,
  noticeVersion: "shared-account-v1",
  canConfirm: true,
  review,
};
const capability = { requestId: id, receiptSecret: secret };
function req(
  action = "prepare",
  body: unknown = capability,
  headers: Record<string, string> = {},
) {
  return new Request(`https://mobile.test/v1/account/deletion/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
function auth() {
  vi.mocked(requireRecentAccountAuth).mockResolvedValue({
    userId: user,
    sessionId: session,
    authenticatedAt: "2026-09-09T08:00:00Z",
    authenticationMethod: "password",
    assurance: "aal1",
  });
}
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
describe("account deletion request boundary", () => {
  it("prepares with verified identity and only a hash of the receipt, but cannot enable deletion", async () => {
    auth();
    const fetcher = vi.fn(async () => Response.json(prepared));
    const response = await manageAccountDeletionRequest(
      req(),
      "prepare",
      env,
      fetcher,
    );
    expect(response).toEqual({ ...prepared, canConfirm: false });
    expect(requireRecentAccountAuth).toHaveBeenCalledOnce();
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toEqual({
      p_action: "prepare",
      p_environment: "SANDBOX",
      p_request: id,
      p_receipt_hash: createHash("sha256").update(secret).digest("hex"),
      p_user: user,
      p_session: session,
      p_authenticated_at: "2026-09-09T08:00:00Z",
      p_authentication_method: "password",
      p_assurance: "aal1",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
  it("reads a receipt after app and request flags are disabled without a customer session", async () => {
    const fetcher = vi.fn(async () => Response.json(status));
    expect(
      await manageAccountDeletionRequest(
        req("status"),
        "status",
        { ...env, MOBILE_ACCOUNT_REQUESTS_ENABLED: "false" },
        fetcher,
      ),
    ).toEqual(status);
    expect(requireRecentAccountAuth).not.toHaveBeenCalled();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty(
      "p_user",
    );
  });
  it.each(["prepare", "cancel"] as const)(
    "%s requires recent account authentication",
    async (action) => {
      vi.mocked(requireRecentAccountAuth).mockRejectedValue(
        new Error("Sign in again"),
      );
      const fetcher = vi.fn();
      await expect(
        manageAccountDeletionRequest(req(action), action, env, fetcher),
      ).rejects.toThrow("Sign in again");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("cannot accept a real destructive request even if environment flags are switched on", async () => {
    const fetcher = vi.fn();
    await expect(
      manageAccountDeletionRequest(
        req("confirm", {
          ...capability,
          challenge: session,
          noticeVersion: "shared-account-v1",
          confirmation: "DELETE MY FURNIO ACCOUNT",
          acknowledgeSharedAccount: true,
          acknowledgeBilling: true,
        }),
        "confirm",
        env,
        fetcher,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(requireRecentAccountAuth).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { ...capability, userId: user },
    { ...capability, receiptSecret: "short" },
    { ...capability, requestId: "not-uuid" },
    { ...capability, challenge: session },
  ])("rejects injected selectors or invalid capability", async (body) => {
    const fetcher = vi.fn();
    await expect(
      manageAccountDeletionRequest(req("status", body), "status", env, fetcher),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects secret-bearing query strings", async () => {
    const request = new Request(
      `https://mobile.test/v1/account/deletion/status?token=${secret}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capability),
      },
    );
    await expect(
      manageAccountDeletionRequest(request, "status", env, vi.fn()),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("bounds input before authentication or database requests", async () => {
    await expect(
      manageAccountDeletionRequest(
        req("prepare", { text: "x".repeat(5000) }),
        "prepare",
        env,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(requireRecentAccountAuth).not.toHaveBeenCalled();
  });
  it("rejects non-JSON requests", async () => {
    await expect(
      manageAccountDeletionRequest(
        req("status", capability, { "Content-Type": "text/plain" }),
        "status",
        env,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("does not disclose a missing or invalid receipt", async () => {
    await expect(
      manageAccountDeletionRequest(req("status"), "status", env, async () =>
        Response.json(null),
      ),
    ).rejects.toMatchObject({
      status: 404,
      message: "Account request receipt not found.",
    });
  });
  it.each([
    { ...status, requestId: user },
    { ...status, email: "private@example.invalid" },
    { ...status, state: "queued" },
    { ...status, expiresAt: "2026-09-09T09:00:00Z" },
  ])("rejects incompatible upstream status", async (body) => {
    await expect(
      manageAccountDeletionRequest(req("status"), "status", env, async () =>
        Response.json(body),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("keeps receipt routing independent of app entry, with no-store and redacted logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(status)),
    );
    const response = await worker.fetch(req("status"), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
  it("rejects browser-origin requests", async () => {
    const response = await worker.fetch(
      req("status", capability, { Origin: "https://evil.invalid" }),
      env,
    );
    expect(response.status).toBe(403);
  });
});
