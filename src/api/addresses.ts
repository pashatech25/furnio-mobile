import { z } from "zod";

const contextItem = z.object({ name: z.string().optional(), country_code: z.string().optional() });
const responseSchema = z.object({ features: z.array(z.object({
  geometry: z.object({ coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }),
  properties: z.object({
    full_address: z.string().optional(), name: z.string().optional(), address_number: z.string().optional(),
    context: z.object({ place: contextItem.optional(), region: contextItem.optional(), postcode: contextItem.optional(), country: contextItem.optional() }).optional(),
  }),
})) });

export type AddressSuggestion = {
  address: string; addressLine1: string; locality: string; region: string;
  postalCode: string; countryCode: string; latitude: number; longitude: number;
};
export function parseAddresses(payload: unknown): AddressSuggestion[] {
  return responseSchema.parse(payload).features.map(({ properties: p, geometry }) => {
    const address = p.full_address ?? p.name ?? "";
    const number = p.address_number ?? "";
    const name = p.name ?? "";
    const line = number && !name.startsWith(number + " ") ? `${number} ${name}` : name;
    return {
      address, addressLine1: line || address.split(",")[0] || address,
      locality: p.context?.place?.name ?? "", region: p.context?.region?.name ?? "",
      postalCode: p.context?.postcode?.name ?? "",
      countryCode: p.context?.country?.country_code?.toUpperCase() ?? "",
      longitude: geometry.coordinates[0], latitude: geometry.coordinates[1],
    };
  }).filter((item) => item.address && /^[A-Z]{2}$/.test(item.countryCode));
}
function publicToken(token: string | undefined): string {
  if (!token?.startsWith("pk.")) throw new Error("Address lookup is not configured. You can enter the address manually.");
  return token;
}
export async function suggestAddresses(query: string, token: string | undefined, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  if (query.trim().length < 4) return [];
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("access_token", publicToken(token));
  url.searchParams.set("q", query.trim().slice(0, 240));
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("types", "address");
  url.searchParams.set("limit", "5");
  url.searchParams.set("permanent", "false");
  const response = await fetcher(url.href, { signal });
  if (!response.ok) throw new Error("Address lookup is temporarily unavailable. You can still enter the address manually.");
  return parseAddresses(await response.json());
}
export function temporaryMapUrl(address: Pick<AddressSuggestion, "longitude" | "latitude">, token: string | undefined) {
  const [longitude, latitude] = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).parse([address.longitude, address.latitude]);
  // Preserve Mapbox's logo and attribution. Coordinates stay in this component's
  // temporary preview, never in saved drafts or the project creation payload.
  // Neutral light cartography with Furnio forest-green marker; retain labels,
  // logo and attribution rather than tinting or obscuring the map image.
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-s+103d31(${longitude},${latitude})/${longitude},${latitude},15,0/640x280@2x?access_token=${encodeURIComponent(publicToken(token))}`;
}
