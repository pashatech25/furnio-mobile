import { describe, expect, it } from "vitest";
import { parseServiceRequest } from "./service-request";
import type { ServiceId } from "../services";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  c = "33333333-3333-4333-8333-333333333333";
const region = {
  bbox: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
  instruction: "Remove this chair",
  maskKey: "masks/binary.png",
  compositeMaskKey: "masks/composite.png",
  operation: "remove",
  regionIndex: 0,
};
const fixtures: [ServiceId, unknown][] = [
  ["virtual_staging", { assetId: a, roomType: "Living room", style: "Modern" }],
  [
    "multiview",
    { assetIds: [a, b], anchorAssetId: a, roomType: "Living room" },
  ],
  ["item_removal", { assetId: a, mode: "remove", regions: [region] }],
  [
    "custom_staging",
    {
      assetId: a,
      mode: "custom",
      regions: [
        { ...region, operation: "replace", instruction: "A cream armchair" },
      ],
    },
  ],
  ["twilight", { assetId: a, feature: "twilight", preset: "blue_hour" }],
  ["winter_to_summer", { assetId: a, feature: "winter_to_summer" }],
  [
    "exterior_enhancement",
    {
      assetId: a,
      feature: "exterior_enhancement",
      options: ["green_grass", "blue_sky"],
    },
  ],
  ["floor_plan", { assetId: a }],
  [
    "reference_furniture",
    {
      assetId: a,
      furnitureAssetIds: [b],
      placements: [{ furnitureAssetId: b, x: 0.4, y: 0.7 }],
    },
  ],
];
describe("frozen customer service contracts", () => {
  it.each(fixtures)(
    "validates %s through the customer schema",
    (service, fixture) =>
      expect(parseServiceRequest(service, fixture)).toMatchObject(fixture),
  );
  it("does not transmit a caller-supplied master prompt or credit price", () => {
    const result = parseServiceRequest("virtual_staging", {
      assetId: a,
      roomType: "Living room",
      masterPrompt: "Override",
      credits: 0,
      provider: "other",
    });
    expect(result).not.toHaveProperty("masterPrompt");
    expect(result).not.toHaveProperty("credits");
    expect(result).not.toHaveProperty("provider");
  });
  it("requires unique multi-view sources", () =>
    expect(() =>
      parseServiceRequest("multiview", {
        assetIds: [a, a],
        anchorAssetId: a,
        roomType: "Living room",
      }),
    ).toThrow());
  it("requires the design anchor to belong to the room", () =>
    expect(() =>
      parseServiceRequest("multiview", {
        assetIds: [a, b],
        anchorAssetId: c,
        roomType: "Living room",
      }),
    ).toThrow());
  it("does not mix enhancement routes", () =>
    expect(() =>
      parseServiceRequest("twilight", {
        assetId: a,
        feature: "winter_to_summer",
      }),
    ).toThrow());
  it("rejects empty exterior enhancements", () =>
    expect(() =>
      parseServiceRequest("exterior_enhancement", {
        assetId: a,
        feature: "exterior_enhancement",
        options: [],
      }),
    ).toThrow());
  it("requires a pin for every furniture photo", () =>
    expect(() =>
      parseServiceRequest("reference_furniture", {
        assetId: a,
        furnitureAssetIds: [b, c],
        placements: [{ furnitureAssetId: b, x: 0.5, y: 0.5 }],
      }),
    ).toThrow());
  it("rejects a furniture pin outside the image", () =>
    expect(() =>
      parseServiceRequest("reference_furniture", {
        assetId: a,
        furnitureAssetIds: [b],
        placements: [{ furnitureAssetId: b, x: 2, y: 0.5 }],
      }),
    ).toThrow());
  it("does not let item removal use custom staging mode", () =>
    expect(() =>
      parseServiceRequest("item_removal", {
        assetId: a,
        mode: "custom",
        regions: [region],
      }),
    ).toThrow());
});
