/** Same two server-protected delivery routes as the customer website. */
export function resultDownloadPath(assetId: string, accessLevel: "paid" | "trial_locked") {
  return `/api/assets/${assetId}/${accessLevel === "trial_locked" ? "preview" : "download"}`;
}
