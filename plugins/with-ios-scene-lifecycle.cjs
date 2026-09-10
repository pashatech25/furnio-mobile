const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");
const sceneDelegate = `
// Furnio single-window scene lifecycle. Keep Expo subscribers and React links.
class FurnioSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private var app: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene, let app else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    app.window = window
    var launchOptions = app.initialLaunchOptions ?? [:]
    if let context = options.urlContexts.first {
      launchOptions[.url] = context.url
      launchOptions[.sourceApplication] = context.options.sourceApplication
    }
    if let activity = options.userActivities.first {
      launchOptions[.userActivityDictionary] = ["UIApplicationLaunchOptionsUserActivityKey": activity]
    }
    app.reactNativeFactory?.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
    window.makeKeyAndVisible()
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      if let annotation = context.options.annotation { options[.annotation] = annotation }
      _ = app?.application(UIApplication.shared, open: context.url, options: options)
    }
  }
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = app?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
  func sceneDidBecomeActive(_ scene: UIScene) { app?.applicationDidBecomeActive(UIApplication.shared) }
  func sceneWillResignActive(_ scene: UIScene) { app?.applicationWillResignActive(UIApplication.shared) }
  func sceneDidEnterBackground(_ scene: UIScene) { app?.applicationDidEnterBackground(UIApplication.shared) }
  func sceneWillEnterForeground(_ scene: UIScene) { app?.applicationWillEnterForeground(UIApplication.shared) }
}
`;
function patchAppDelegate(source) {
  if (source.includes("class FurnioSceneDelegate:")) return source;
  const start = source.indexOf("#if os(iOS) || os(tvOS)");
  const end = source.indexOf("#endif", start);
  if (start < 0 || end < 0 || !source.slice(start, end).includes("factory.startReactNative(")) throw new Error("Review changed Expo AppDelegate startup before applying scene lifecycle.");
  return (source.slice(0, start) + "initialLaunchOptions = launchOptions\n" + source.slice(end + 6))
    .replace("var window: UIWindow?", "var window: UIWindow?\n  var initialLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?") + sceneDelegate;
}
const manifest = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [{
      UISceneConfigurationName: "Furnio",
      UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).FurnioSceneDelegate",
    }],
  },
};
module.exports = config => {
  config = withInfoPlist(config, config => { config.modResults.UIApplicationSceneManifest = manifest; return config; });
  return withAppDelegate(config, config => { config.modResults.contents = patchAppDelegate(config.modResults.contents); return config; });
};
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.manifest = manifest;
