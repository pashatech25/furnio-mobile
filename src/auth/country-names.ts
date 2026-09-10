import countryNames from "./country-names.en.json";

// Generated from ISO calling-code countries using Node's English CLDR names.
// Bundled labels work offline and don't require Hermes Intl.DisplayNames.
export function countryName(code: string): string {
  return countryNames[code as keyof typeof countryNames] ?? code;
}
