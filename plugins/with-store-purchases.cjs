const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

// Preserve a purchase when Google Play opens a banking app for verification.
// See https://www.revenuecat.com/docs/getting-started/installation/reactnative
module.exports = function withStorePurchases(config) {
  return withAndroidManifest(config, (config) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(
      config.modResults,
    );
    activity.$["android:launchMode"] = "singleTop";
    return config;
  });
};
