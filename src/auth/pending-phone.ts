import { parsePhoneNumberFromString } from "libphonenumber-js/min";

// Resume only a server-reported pending phone change. This restores a form;
// it never confirms a phone or substitutes for the actual OTP verification.
export function pendingPhone(value: string | undefined, allowed: readonly string[]) {
  if (!value || !/^\+?\d{8,15}$/.test(value)) return null;
  const parsed = parsePhoneNumberFromString(value.startsWith("+") ? value : `+${value}`);
  return parsed?.isValid() && parsed.country && allowed.includes(parsed.country)
    ? { number: parsed.number, country: parsed.country }
    : null;
}
