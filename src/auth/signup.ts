import { z } from "zod";

export const signupFields = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.email("Enter a valid email address.").trim(),
  password: z.string().min(8, "Choose a password with at least eight characters.").max(256),
  termsAccepted: z.literal(true, { error: "Accept the Terms of Service and Privacy Policy to continue." }),
  marketingAccepted: z.boolean(),
});

export function signupInput(input: {
  name: string; email: string; password: string;
  termsAccepted: boolean; marketingAccepted: boolean;
}, redirectTo: string, captchaToken?: string) {
  const parsed = signupFields.safeParse({ ...input, email: input.email.trim() });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check your account details.");
  const fields = parsed.data;
  return {
    email: fields.email,
    password: fields.password,
    options: {
      emailRedirectTo: redirectTo,
      ...(captchaToken ? { captchaToken } : {}),
      data: {
        full_name: fields.name,
        furnio_locale: "en",
        furnio_terms_accepted: true,
        furnio_terms_version: "2026-08-30",
        furnio_marketing_consent: fields.marketingAccepted,
        furnio_marketing_version: "2026-08-30",
      },
    },
  };
}
