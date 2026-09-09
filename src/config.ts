export type AppMode = "demo" | "staging" | "production";
const productionHosts = new Set([
  "platform.furnio.ai",
  "platform.furnio.io",
  "mobile-api.furnio.ai",
  "sgsjkgfwgxmlqcgyuyeh.supabase.co",
  "auth.furnio.ai",
]);

export function validateEnvironment(input: {
  mode?: string;
  platform?: string;
  mobile?: string;
  supabase?: string;
  key?: string;
}) {
  const mode = input.mode ?? "demo";
  if (!["demo", "staging", "production"].includes(mode))
    throw new Error("Invalid app mode. Use demo, staging or production.");
  if (mode === "demo")
    return {
      mode: "demo" as const,
      platform: "",
      mobile: "",
      supabase: "",
      key: "",
    };
  for (const [name, raw] of Object.entries({
    platform: input.platform,
    mobile: input.mobile,
    supabase: input.supabase,
  })) {
    if (!raw)
      throw new Error(
        `Configure the ${name} URL for ${mode}. No live fallback is permitted.`,
      );
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(`${name} requires a credential-free HTTPS URL.`);
    if (mode === "staging" && productionHosts.has(url.hostname))
      throw new Error(
        "Staging builds cannot connect to a known Furnio production service.",
      );
  }
  if (!input.key || input.key.startsWith("sb_secret_"))
    throw new Error(
      "A Supabase publishable key is required, never a secret key.",
    );
  // Legacy service-role JWTs are never accepted, even when accidentally supplied as a public key.
  if (!input.key.startsWith("sb_publishable_"))
    throw new Error(
      "Use a modern Supabase publishable key for this new native client.",
    );
  return {
    mode: mode as AppMode,
    platform: input.platform!.replace(/\/$/, ""),
    mobile: input.mobile!.replace(/\/$/, ""),
    supabase: input.supabase!.replace(/\/$/, ""),
    key: input.key,
  };
}

export const config = validateEnvironment({
  mode: process.env.EXPO_PUBLIC_APP_MODE,
  platform: process.env.EXPO_PUBLIC_PLATFORM_API_URL,
  mobile: process.env.EXPO_PUBLIC_MOBILE_API_URL,
  supabase: process.env.EXPO_PUBLIC_SUPABASE_URL,
  key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
export const demo = config.mode === "demo";
