export const serviceIds = [
  "virtual_staging",
  "multiview",
  "item_removal",
  "custom_staging",
  "twilight",
  "winter_to_summer",
  "exterior_enhancement",
  "floor_plan",
  "reference_furniture",
] as const;
export type ServiceId = (typeof serviceIds)[number];
