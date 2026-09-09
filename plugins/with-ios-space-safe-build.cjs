const { withXcodeProject, withPodfile } = require("expo/config-plugins");

// Expo 57's generated shell phases otherwise split the approved "Furnio Mobile"
// path. Keep this local and reproducible through prebuild/pod install; do not
// hand-edit Pods or dependency sources. Remove after upstream fixes are verified.
function quoteBundleScript(script) {
  let found = 0;
  const result = script
    .split("\n")
    .map((line) => {
      if (!line.includes("/scripts/react-native-xcode.sh")) return line;
      found++;
      if (line.startsWith('"`') && line.endsWith('`"')) return line;
      if (!line.startsWith("`") || !line.endsWith("`")) {
        throw new Error(
          "React Native bundle script changed; review path quoting before building.",
        );
      }
      return '"' + line + '"';
    })
    .join("\n");
  if (found !== 1) throw new Error("Expected one React Native bundle command.");
  return result;
}

const marker = "# Furnio: quote Expo Constants script paths containing spaces";
const legacyScript =
  "bash -l -c 'exec \"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\"'";
// The upstream script also uses unquoted `basename $PROJECT_DIR` and silently
// exits when that path has spaces. Preserve its real root first; use a safe
// basename only inside this specific EXConstants child process.
const constantsScript =
  'bash -l -c \'export PROJECT_ROOT="${PROJECT_ROOT:-$PROJECT_DIR/../..}"; export PROJECT_DIR=Pods; exec "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"\'';
const hook = `
    ${marker}
    installer.pods_project.targets.each do |target|
      next unless target.name == 'EXConstants'
      target.shell_script_build_phases.each do |phase|
        next unless phase.name == '[CP-User] Generate app.config for prebuilt Constants.manifest'
        original = %q{bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"}
        quoted = %q{${constantsScript}}
        unless phase.shell_script == original || phase.shell_script == quoted
          raise 'Expo Constants build script changed; review Furnio path quoting.'
        end
        phase.shell_script = quoted
      end
    end
`;
function patchPodfile(contents) {
  if (contents.includes(marker))
    return contents.replace(
      `quoted = %q{${legacyScript}}`,
      `quoted = %q{${constantsScript}}`,
    );
  const target = "post_install do |installer|";
  if (contents.split(target).length !== 2)
    throw new Error("Expected one CocoaPods post-install hook.");
  return contents.replace(target, target + hook);
}

function withIosSpaceSafeBuild(config) {
  config = withXcodeProject(config, (config) => {
    const phases =
      config.modResults.hash.project.objects.PBXShellScriptBuildPhase;
    let found = false;
    for (const phase of Object.values(phases)) {
      if (
        typeof phase !== "object" ||
        !phase.name?.includes("Bundle React Native code and images")
      )
        continue;
      const decoded = JSON.parse(phase.shellScript);
      phase.shellScript = JSON.stringify(quoteBundleScript(decoded));
      found = true;
    }
    if (!found) throw new Error("React Native bundling phase missing.");
    return config;
  });
  return withPodfile(config, (config) => {
    config.modResults.contents = patchPodfile(config.modResults.contents);
    return config;
  });
}
module.exports = withIosSpaceSafeBuild;
module.exports.quoteBundleScript = quoteBundleScript;
module.exports.patchPodfile = patchPodfile;
module.exports.constantsScript = constantsScript;
