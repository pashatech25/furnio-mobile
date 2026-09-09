import type { ImageSourcePropType } from "react-native";
export { parseServiceRequest } from "./api/service-request";

export { serviceIds, type ServiceId } from "./service-ids";
import type { ServiceId } from "./service-ids";
export const photos = {
  stage: require("../assets/stage.jpg"),
  before: require("../assets/before.jpg"),
  after: require("../assets/after.jpg"),
  twilight: require("../assets/twilight.jpg"),
  floor: require("../assets/floor.jpg"),
};
export type Service = {
  id: ServiceId;
  name: string;
  description: string;
  image: ImageSourcePropType;
  endpoint: string;
  min: number;
  max: number;
  instruction: string;
};
export const services: Service[] = [
  {
    id: "virtual_staging",
    name: "Virtual staging",
    description: "Furniture, without the furniture truck.",
    image: photos.stage,
    endpoint: "/api/jobs/stage",
    min: 1,
    max: 1,
    instruction:
      "Choose a room and a furniture style. Permanent surfaces and the photographed structure are protected by Furnio’s server-side instructions.",
  },
  {
    id: "multiview",
    name: "Multi-view staging",
    description: "One room. Every angle.",
    image: require("../assets/multiview.jpg"),
    endpoint: "/api/jobs/multiview",
    min: 2,
    max: 4,
    instruction:
      "Add 2–4 different views of the same room. Select your design anchor, then order the remaining views. Do not mix different rooms.",
  },
  {
    id: "item_removal",
    name: "Item removal",
    description: "Make room for possibilities.",
    image: require("../assets/remove.jpg"),
    endpoint: "/api/jobs/mask-edit",
    min: 1,
    max: 1,
    instruction:
      "Paint precisely over the objects you want removed. Each of up to eight regions has its own instruction; untouched areas are preserved.",
  },
  {
    id: "custom_staging",
    name: "Custom staging",
    description: "A considered change, right here.",
    image: require("../assets/custom.jpg"),
    endpoint: "/api/jobs/mask-edit",
    min: 1,
    max: 1,
    instruction:
      "Paint the areas to replace or restyle, then describe each change. Furnio keeps its own master instructions; your note is an additional direction.",
  },
  {
    id: "twilight",
    name: "Twilight",
    description: "From daylight to the golden moment.",
    image: photos.twilight,
    endpoint: "/api/jobs/enhance",
    min: 1,
    max: 1,
    instruction:
      "Upload an exterior photo and select pink twilight, blue hour or natural dusk.",
  },
  {
    id: "winter_to_summer",
    name: "Winter to summer",
    description: "Put the best season forward.",
    image: require("../assets/summer.jpg"),
    endpoint: "/api/jobs/enhance",
    min: 1,
    max: 1,
    instruction:
      "Upload a winter exterior. The existing server preset changes seasonal snow and vegetation while preserving the property.",
  },
  {
    id: "exterior_enhancement",
    name: "Exterior enhancement",
    description: "A little more curb appeal.",
    image: require("../assets/exterior.jpg"),
    endpoint: "/api/jobs/enhance",
    min: 1,
    max: 1,
    instruction:
      "Select one or more improvements. Shared exterior preservation rules are applied by the existing Worker.",
  },
  {
    id: "floor_plan",
    name: "3D floor plan",
    description: "Give a flat plan a new perspective.",
    image: photos.floor,
    endpoint: "/api/jobs/floorplan",
    min: 1,
    max: 1,
    instruction:
      "Upload a clear JPEG or a single-page PDF floor plan, up to 20 MB. Multi-page PDFs must be split before upload.",
  },
  {
    id: "reference_furniture",
    name: "Reference furniture",
    description: "Your pieces. Beautifully placed.",
    image: photos.after,
    endpoint: "/api/jobs/reference-furniture",
    min: 1,
    max: 1,
    instruction:
      "Add a room photo and 1–5 separate furniture photos. Place a numbered pin on the floor for every piece.",
  },
];
export function getService(id: string) {
  return services.find((service) => service.id === id);
}
