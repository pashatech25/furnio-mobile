import { Platform } from "react-native";

// Owner-approved iOS commerce restoration. Android stays consumption-only.
// Acquisition additionally requires the build flag and server readiness checks;
// recovery remains independently gated so disabling sales cannot strand payments.
export const nativeCommerceAllowed: boolean = Platform.OS === "ios";
