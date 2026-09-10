import { describe, expect, it, vi } from "vitest";
import { parseAddresses, suggestAddresses, temporaryMapUrl } from "./addresses";
const payload = { features: [{ geometry: { coordinates: [-79.38, 43.65] }, properties: { full_address: "100 Queen Street, Toronto, Canada", name: "100 Queen Street", address_number: "100", context: { country: { country_code: "ca" }, place: { name: "Toronto" }, region: { name: "Ontario" }, postcode: { name: "M5H 2N2" } } } }] };
describe("temporary property address lookup", () => {
  it("fills structured address fields without duplicating the street number", () => {
    expect(parseAddresses(payload)[0]).toMatchObject({ addressLine1: "100 Queen Street", locality: "Toronto", region: "Ontario", postalCode: "M5H 2N2", countryCode: "CA" });
  });
  it("bounds coordinates before constructing a map URL", () => {
    expect(() => temporaryMapUrl({ longitude: Infinity, latitude: 43 }, "pk.test")).toThrow();
    expect(temporaryMapUrl({ longitude: -79, latitude: 43 }, "pk.test")).toContain("-79,43,15");
  });
  it("rejects secret tokens", () => {
    expect(() => temporaryMapUrl({ longitude: -79, latitude: 43 }, "sk.secret")).toThrow();
  });
  it("uses temporary geocoding, cancellation and no Furnio session headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
    const signal = new AbortController().signal;
    await suggestAddresses("100 Queen Street", "pk.test", signal, fetcher);
    const [url, options] = fetcher.mock.calls[0];
    expect(new URL(url).searchParams.get("permanent")).toBe("false");
    expect(options).toEqual({ signal });
  });
  it("does not query short inputs", async () => {
    const fetcher = vi.fn();
    expect(await suggestAddresses("100", "pk.test", new AbortController().signal, fetcher)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
