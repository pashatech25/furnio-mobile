import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Furnio",
  slug: "furnio-mobile",
  version: "0.1.0",
  scheme: "furnio",
  orientation: "default",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  backgroundColor: "#f7f5ef",
  ios: {
    bundleIdentifier: "ai.furnio.app",
    appleTeamId: "5SY24C9RBH",
    supportsTablet: true,
    usesAppleSignIn: true,
    // RN 0.86 is new-architecture-only. Its CocoaPods discovery uses an
    // unquoted find path; persist this app-owned value through Expo instead.
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      RCTNewArchEnabled: true,
    },
  },
  android: { package: "ai.furnio.app" },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/icon.png",
    name: "Furnio Mobile · Development Preview",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-audio", { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false, enableBackgroundRecording: false }],
    "expo-apple-authentication",
    "expo-system-ui",
    [
      "expo-image-picker",
      {
        photosPermission:
          "Choose property photos and furniture references to edit with Furnio.",
        cameraPermission: "Take property photos to edit with Furnio.",
        microphonePermission: false,
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: "Access your selected Furnio photos.",
        savePhotosPermission:
          "Save your finished Furnio images to your photo library.",
        granularPermissions: ["photo"],
      },
    ],
    "expo-notifications",
    "expo-status-bar",
    "expo-web-browser",
    "expo-sharing",
    "./plugins/with-ios-space-safe-build.cjs",
    "./plugins/with-ios-scene-lifecycle.cjs",
  ],
  extra: {
    furnioEnvironment: process.env.EXPO_PUBLIC_APP_MODE ?? "demo",
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
      : {}),
  },
};
export default config;
