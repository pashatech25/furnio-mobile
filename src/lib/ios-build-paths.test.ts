import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { quoteBundleScript, patchPodfile } =
  require("../../plugins/with-ios-space-safe-build.cjs") as {
    quoteBundleScript: (source: string) => string;
    patchPodfile: (source: string) => string;
  };

describe("iOS build paths containing spaces", () => {
  it("quotes the resolved bundle script path and is idempotent", () => {
    const command =
      '`"$NODE_BINARY" --print "require.resolve(\'react-native/scripts/react-native-xcode.sh\')"`';
    const source = `export PROJECT_ROOT="$PROJECT_DIR"/..\n${command}\n`;
    const patched = quoteBundleScript(source);
    expect(patched).toContain(`"${command}"`);
    expect(quoteBundleScript(patched)).toBe(patched);
    expect(patched).toContain('export PROJECT_ROOT="$PROJECT_DIR"/..');
  });
  it("adds a narrowly scoped idempotent Pods hook", () => {
    const source =
      "post_install do |installer|\n  react_native_post_install(installer)\nend\n";
    const patched = patchPodfile(source);
    expect(patched).toContain("next unless target.name == 'EXConstants'");
    expect(patched).toContain(
      'exec "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"',
    );
    expect(patched).toContain(
      'export PROJECT_ROOT="${PROJECT_ROOT:-$PROJECT_DIR/../..}"; export PROJECT_DIR=Pods;',
    );
    expect(patchPodfile(patched)).toBe(patched);
    expect(patched).toContain("react_native_post_install(installer)");
  });
  it("fails visibly if upstream build structure changes", () => {
    expect(() => quoteBundleScript("unrecognised")).toThrow();
    expect(() => patchPodfile("unrecognised")).toThrow();
  });
});
