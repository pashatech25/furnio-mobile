import { describe, expect, it, vi } from "vitest";
import { getCountries } from "libphonenumber-js/min";
import { countryName } from "./country-names";

describe("native phone-verification country labels", () => {
  it("works when the native engine has no Intl.DisplayNames constructor", () => {
    const original = Object.getOwnPropertyDescriptor(Intl, "DisplayNames");
    Object.defineProperty(Intl, "DisplayNames", { configurable: true, value: undefined });
    try {
      expect(countryName("CA")).toBe("Canada");
      expect(countryName("US")).toBe("United States");
      expect(countryName("AU")).toBe("Australia");
    } finally {
      if (original) Object.defineProperty(Intl, "DisplayNames", original);
      vi.restoreAllMocks();
    }
  });
  it("has an offline name for every selectable phone country", () => {
    for (const code of getCountries()) {
      expect(countryName(code)).not.toBe(code);
      expect(countryName(code).length).toBeGreaterThan(2);
    }
  });
  it("does not crash on an unknown server country", () => {
    expect(countryName("ZZ")).toBe("ZZ");
  });
});
