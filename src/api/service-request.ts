import {
  stageJobInputSchema,
  multiViewJobInputSchema,
  enhancementJobInputSchema,
  floorplanJobInputSchema,
  referenceFurnitureJobInputSchema,
  maskEditJobInputSchema,
} from "../contracts/jobs";
import type { ServiceId } from "../services";
export function parseServiceRequest(service: ServiceId, input: unknown) {
  switch (service) {
    case "virtual_staging":
      return stageJobInputSchema.parse(input);
    case "multiview":
      return multiViewJobInputSchema.parse(input);
    case "twilight":
    case "winter_to_summer":
    case "exterior_enhancement": {
      const data = enhancementJobInputSchema.parse(input);
      if (data.feature !== service)
        throw new Error("Service and enhancement request must match.");
      return data;
    }
    case "floor_plan":
      return floorplanJobInputSchema.parse(input);
    case "reference_furniture":
      return referenceFurnitureJobInputSchema.parse(input);
    case "item_removal":
    case "custom_staging": {
      const data = maskEditJobInputSchema.parse(input);
      if (data.mode !== (service === "item_removal" ? "remove" : "custom"))
        throw new Error("Mask mode does not match the service.");
      return data;
    }
  }
}
