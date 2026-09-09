import { z } from "zod";
import { boundedJson, HttpError } from "./http";

const claimsSchema = z.object({
  sub: z.uuid(),
  session_id: z.uuid(),
  iss: z.string(),
  aud: z.literal("authenticated"),
  role: z.literal("authenticated"),
  is_anonymous: z.literal(false),
  aal: z.enum(["aal1", "aal2"]),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  amr: z
    .array(
      z.object({
        method: z.string().max(80),
        timestamp: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(20),
});
const authUserSchema = z.object({
  id: z.uuid(),
  is_anonymous: z.literal(false),
  deleted_at: z.string().nullable().optional(),
});
export const RECENT_AUTH_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 30;
const eligibleMethods = new Set(["password", "oauth", "otp", "totp"]);

function invalidSession(): never {
  throw new HttpError(401, "Sign in again before reviewing account deletion.");
}
function decodePart(part: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) return invalidSession();
  try {
    const base64 = part.replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(base64), (character) =>
      character.charCodeAt(0),
    );
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    return invalidSession();
  }
}

// A decoder is NOT a signature verifier. Nothing derived here is trusted until
// Auth's fixed-origin /user endpoint verifies the SAME bearer token, and the
// account-review RPC checks the matching live auth.sessions row. This module
// does not replace the website or processing API's authentication middleware.
export async function requireRecentAccountAuth(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  if (!/^[a-z0-9]{20}$/.test(env.SUPABASE_PROJECT_REF ?? ""))
    throw new HttpError(503, "Account security is not configured.");
  const base = `https://${env.SUPABASE_PROJECT_REF}.supabase.co`;
  if (
    env.SUPABASE_URL?.replace(/\/$/, "") !== base ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !["staging", "production"].includes(env.ENVIRONMENT) ||
    (env.ENVIRONMENT === "staging" &&
      env.SUPABASE_PROJECT_REF === "sgsjkgfwgxmlqcgyuyeh")
  )
    throw new HttpError(503, "Account security is not configured.");

  const authorization = request.headers.get("Authorization");
  const token =
    authorization &&
    /^Bearer ([A-Za-z0-9_.-]{20,8192})$/.exec(authorization)?.[1];
  if (!token) return invalidSession();
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2])
    return invalidSession();
  const header = z
    .object({ alg: z.enum(["ES256", "RS256"]) })
    .safeParse(decodePart(parts[0]));
  const parsed = claimsSchema.safeParse(decodePart(parts[1]));
  if (!header.success || !parsed.success) return invalidSession();
  const claims = parsed.data;
  const seconds = Math.floor(now / 1000);
  if (
    claims.iss !== `${base}/auth/v1` ||
    claims.exp <= seconds ||
    claims.iat > seconds + CLOCK_SKEW_SECONDS ||
    claims.iat >= claims.exp
  )
    return invalidSession();
  const latestMethod = claims.amr
    .filter((entry) => eligibleMethods.has(entry.method))
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  if (!latestMethod) return invalidSession();
  const authenticatedAt = latestMethod.timestamp;
  // A refreshed JWT's iat, last_sign_in_at, recovery token, or user metadata is
  // NOT proof of a recent sign-in. Use the verified authentication-method time.
  if (
    authenticatedAt <= seconds - RECENT_AUTH_SECONDS ||
    authenticatedAt > seconds + CLOCK_SKEW_SECONDS ||
    authenticatedAt > claims.iat + CLOCK_SKEW_SECONDS
  )
    return invalidSession();

  let response: Response;
  try {
    response = await fetcher(`${base}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(503, "Account security is temporarily unavailable.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    if ([401, 403, 404].includes(response.status)) return invalidSession();
    throw new HttpError(503, "Account security is temporarily unavailable.");
  }
  const user = authUserSchema.safeParse(await boundedJson(response, 65_536));
  if (!user.success || user.data.deleted_at || user.data.id !== claims.sub)
    return invalidSession();
  return {
    userId: user.data.id,
    sessionId: claims.session_id,
    authenticatedAt: new Date(authenticatedAt * 1000).toISOString(),
    authenticationMethod: latestMethod.method,
    assurance: claims.aal,
  };
}
