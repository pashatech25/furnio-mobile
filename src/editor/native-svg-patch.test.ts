import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const androidSource = (name: string) =>
  readFileSync(
    new URL(
      `../../node_modules/react-native-svg/android/src/main/java/com/horcrux/svg/${name}.java`,
      import.meta.url,
    ),
    "utf8",
  );

it("serializes Android bounds measurement with a bounded UI-thread wait", () => {
  const source = androidSource("RNSVGRenderableManager");
  const wrapper = source.slice(
    source.indexOf("public WritableMap getBBox("),
    source.indexOf("private WritableMap getBBoxOnUiThread("),
  );
  expect(wrapper).toContain("UiThreadUtil.isOnUiThread()");
  expect(wrapper).toContain("UiThreadUtil.runOnUiThread(measure)");
  expect(wrapper).toContain("measure.get(250, TimeUnit.MILLISECONDS)");
  expect(wrapper).toContain("measure.cancel(false)");
  expect(wrapper).toContain("Thread.currentThread().interrupt()");
  expect(wrapper).not.toContain("getRenderableViewByTag");
  const measure = source.slice(
    source.indexOf("private WritableMap getBBoxOnUiThread("),
    source.indexOf("public WritableMap getCTM("),
  );
  expect(measure).toContain("if (svg.mPath == null)");
  expect(measure.indexOf("root.prepareForMeasurement()")).toBeLessThan(
    measure.indexOf("svg.getPath(null, null)"),
  );
});

it("prepares Android offscreen glyph bounds with a one-pixel allocation and releases it", () => {
  const source = androidSource("SvgView");
  const prepare = source.slice(
    source.indexOf("void prepareForMeasurement()"),
    source.indexOf("String toDataURL()"),
  );
  expect(prepare).toContain(
    "Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)",
  );
  expect(prepare).toContain("drawChildren(new Canvas(bitmap))");
  expect(prepare).toContain("finally");
  expect(prepare).toContain("mCanvas = previousCanvas");
  expect(prepare).toContain("bitmap.recycle()");
});

it("reports Android cached-image readiness once for the current source, including repeat exports", () => {
  const source = androidSource("ImageView");
  expect(source).toContain("notifyBitmapLoaded(bitmap, requestedUri)");
  expect(source).toContain("notifyBitmapLoaded(bitmap, uriString)");
  expect(source).toContain("!loadedUri.equals(uriString)");
  expect(source).toContain("loadedUri.equals(notifiedUri)");
  expect(source).toContain("!Objects.equals(uriString, nextUri)");
  expect(source).toContain("notifiedUri = null");
  expect(source).toContain("if (dispatcher != null)");
  expect(source).toContain("bitmap == null");
});

it("pins the local iOS pixel-export fix to the installed SVG version", () => {
  const root = new URL("../../", import.meta.url);
  const metadata = JSON.parse(
    readFileSync(new URL("package.json", root), "utf8"),
  );
  expect(metadata.dependencies["react-native-svg"]).toBe("15.15.4");
  expect(readFileSync(new URL("pnpm-workspace.yaml", root), "utf8")).toContain(
    "react-native-svg@15.15.4: patches/react-native-svg@15.15.4.patch",
  );
  const native = readFileSync(
    new URL(
      "node_modules/react-native-svg/apple/Elements/RNSVGSvgView.mm",
      root,
    ),
    "utf8",
  );
  const exporter = native.slice(
    native.indexOf("- (NSString *)getDataURLWithBounds:"),
  );
  expect(exporter).toContain("format.scale = 1;");
  expect(exporter).toContain("format.opaque = NO;");
  expect(exporter).toContain("initWithSize:bounds.size format:format");
  expect(exporter).toContain(
    "drawToContext:rendererContext.CGContext withRect:bounds",
  );
  expect(exporter).toContain("_boundingBox = previousBoundingBox;");
});

it("serializes the whole iOS text measurement with drawing, without dispatching onto itself", () => {
  const root = new URL("../../", import.meta.url);
  const source = readFileSync(
    new URL(
      "node_modules/react-native-svg/apple/RNSVGRenderableModule.mm",
      root,
    ),
    "utf8",
  );
  const wrapper = source.slice(
    source.indexOf("RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getBBox"),
    source.indexOf("- (NSDictionary *)getBBoxOnMainThread:"),
  );
  expect(wrapper).toContain(
    "bounds = [self getBBoxOnMainThread:reactTag options:options];",
  );
  expect(wrapper).toContain("if ([NSThread isMainThread])");
  expect(wrapper).toContain(
    "dispatch_sync(dispatch_get_main_queue(), measure);",
  );
  expect(wrapper).not.toContain("[svg getPath:nil]");
  const measurement = source.slice(
    source.indexOf("- (NSDictionary *)getBBoxOnMainThread:"),
    source.indexOf("RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getCTM"),
  );
  expect(measurement).toContain("[self getRenderableView:reactTag]");
  expect(measurement).toContain("[svg getPath:nil]");
  expect(measurement).toContain(
    "[svg.svgView getDataURLWithBounds:CGRectMake(0, 0, 1, 1)]",
  );
  expect(measurement.indexOf("getDataURLWithBounds")).toBeLessThan(
    measurement.indexOf("svg.fillBounds"),
  );
  expect(measurement).toContain("svg.fillBounds");
  const lookup = source.slice(
    source.indexOf("- (RNSVGPlatformView *)getRenderableView:"),
    source.indexOf(
      "- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:",
    ),
  );
  expect(lookup).toContain("if ([NSThread isMainThread])");
  expect(lookup).toContain("dispatch_sync(dispatch_get_main_queue(), lookup);");
  expect(
    readFileSync(
      new URL("patches/react-native-svg@15.15.4.patch", root),
      "utf8",
    ),
  ).toContain("getBBoxOnMainThread");
});
