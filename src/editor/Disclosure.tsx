import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Platform, Pressable, Switch, View } from "react-native";
import Svg, { Image as SvgImage, Text as SvgText } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { OwnExportFile } from "../results/export-session";
import type { ExportKind } from "../results/export-recovery";
import {
  createDisclosureCapture,
  DisclosureExportError,
  prepareDisclosureJpeg,
  validatedDisclosure,
} from "./disclosure-export";
import {
  Body,
  Button,
  Card,
  colors,
  Field,
  Heading,
  Label,
  Notice,
  styles,
} from "../ui";
import {
  fitDisclosureScale,
  fonts,
  nativeDisclosureFont,
  placement,
  positions,
  type Disclosure,
} from "./disclosure-settings";
export function DisclosureControls({
  value,
  onChange,
}: {
  value: Disclosure;
  onChange: (value: Disclosure) => void;
}) {
  const update = (next: Partial<Disclosure>) => onChange({ ...value, ...next });
  return (
    <Card>
      <View style={styles.between}>
        <Heading small>Your disclosure.</Heading>
        <Switch
          accessibilityLabel="Include a disclosure label"
          value={value.enabled}
          onValueChange={(enabled) => update({ enabled })}
          trackColor={{ true: colors.ink }}
        />
      </View>
      <Body muted style={{ fontSize: 14 }}>
        Applied on your device when saving or sharing. Your original result is
        unchanged.
      </Body>
      {value.enabled && (
        <>
          <Field
            label="Disclosure text"
            maxLength={80}
            value={value.text}
            onChangeText={(text) => update({ text })}
          />
          <Body muted style={{ fontSize: 14 }}>
            Up to 80 characters. Longer labels shrink to fit the photo.
          </Body>
          <Label>Font</Label>
          {Platform.OS === "android" && (
            <Body muted style={{ fontSize: 14 }}>
              Android uses system equivalents: sans-serif for Arial and
              Helvetica, serif for Georgia and Times New Roman, and monospace
              for Courier New.
            </Body>
          )}
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {fonts.map((fontFamily) => (
              <Pressable
                key={fontFamily}
                accessibilityRole="button"
                accessibilityState={{
                  selected: value.fontFamily === fontFamily,
                }}
                onPress={() => update({ fontFamily })}
                style={{
                  padding: 10,
                  backgroundColor:
                    value.fontFamily === fontFamily
                      ? colors.soft
                      : colors.paper,
                  borderRadius: 8,
                }}
              >
                <Body style={{ fontSize: 14 }}>{fontFamily}</Body>
              </Pressable>
            ))}
          </View>
          <Label>Size · {Math.round(value.fontSize)} px</Label>
          <Slider
            accessibilityLabel="Disclosure font size"
            minimumValue={14}
            maximumValue={72}
            step={1}
            value={value.fontSize}
            onValueChange={(fontSize) => update({ fontSize })}
            minimumTrackTintColor={colors.ink}
            thumbTintColor={colors.ink}
          />
          <Label>Opacity · {Math.round(value.opacity * 100)}%</Label>
          <Slider
            accessibilityLabel="Disclosure opacity"
            minimumValue={0.15}
            maximumValue={1}
            step={0.05}
            value={value.opacity}
            onValueChange={(opacity) => update({ opacity })}
            minimumTrackTintColor={colors.ink}
            thumbTintColor={colors.ink}
          />
          <Field
            label="Label color · hex"
            value={value.color}
            onChangeText={(color) => update({ color })}
            autoCapitalize="none"
            maxLength={7}
          />
          <Label>Position</Label>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {positions.map((position) => (
              <Pressable
                key={position}
                accessibilityRole="button"
                accessibilityLabel={position.replace("-", " ")}
                accessibilityState={{ selected: position === value.position }}
                onPress={() => update({ position })}
                style={{
                  width: "30%",
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor:
                    value.position === position ? colors.ink : colors.soft,
                }}
              >
                <Body
                  style={{
                    color:
                      value.position === position ? colors.paper : colors.ink,
                    textAlign: "center",
                    fontSize: 11,
                  }}
                >
                  {position.replace("-", " ")}
                </Body>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}
export function DisclosureText({
  settings,
  width,
  height,
  onReady,
  onError,
}: {
  settings: Disclosure;
  width: number;
  height: number;
  onReady?: () => void;
  onError?: () => void;
}) {
  return settings.enabled && settings.text.trim() ? (
    <MeasuredDisclosureText
      key={JSON.stringify([settings, width, height])}
      settings={settings}
      width={width}
      height={height}
      onReady={onReady}
      onError={onError}
    />
  ) : null;
}

function MeasuredDisclosureText({
  settings,
  width,
  height,
  onReady,
  onError,
}: {
  settings: Disclosure;
  width: number;
  height: number;
  onReady?: () => void;
  onError?: () => void;
}) {
  const text = useRef<SvgText>(null);
  const [scale, setScale] = useState(1);
  const attempts = useRef(0);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  useLayoutEffect(() => {
    let current = true;
    let frame: number;
    const measure = () => {
      if (!current) return;
      try {
        const bounds = text.current?.getBBox({
          clipped: false,
          stroke: false,
          markers: false,
        });
        if (!bounds || !bounds.width || !bounds.height) {
          if (++attempts.current < 12) {
            frame = requestAnimationFrame(measure);
            return;
          }
          callbacks.current.onError?.();
          return;
        }
        const fit = fitDisclosureScale(
          width,
          height,
          bounds.width,
          bounds.height,
        );
        if (fit < 0.999) {
          if (++attempts.current >= 12) {
            callbacks.current.onError?.();
            return;
          }
          // A small safety inset absorbs native font hinting/rounding differences.
          setScale((value) => value * fit * 0.995);
        } else callbacks.current.onReady?.();
      } catch {
        callbacks.current.onError?.();
      }
    };
    frame = requestAnimationFrame(measure);
    return () => {
      current = false;
      cancelAnimationFrame(frame);
    };
  }, [width, height, scale]);
  const point = placement(settings, width, height, scale);
  return (
    <SvgText
      ref={text}
      x={point.x}
      y={point.y}
      textAnchor={point.anchor}
      fontSize={point.size}
      fontFamily={nativeDisclosureFont(settings.fontFamily, Platform.OS)}
      fontWeight="bold"
      fill={
        /^#[a-fA-F0-9]{6}$/.test(settings.color) ? settings.color : "#ffffff"
      }
      opacity={settings.opacity}
    >
      {settings.text.trim()}
    </SvgText>
  );
}
export type DisclosureHandle = {
  render: (
    uri: string,
    settings: Disclosure,
    own: OwnExportFile,
    allocate: (kind: ExportKind) => File,
  ) => Promise<File>;
};
function jpegContext(uri: string) {
  const context = ImageManipulator.manipulate(uri);
  return {
    release: () => context.release(),
    renderAsync: async () => {
      const image = await context.renderAsync();
      return {
        width: image.width,
        height: image.height,
        release: () => image.release(),
        saveAsync: (options: { compress: number; base64: boolean }) =>
          image.saveAsync({ ...options, format: SaveFormat.JPEG }),
      };
    },
  };
}
export const DisclosureRenderer = forwardRef<DisclosureHandle>(
  function DisclosureRenderer(_, ref) {
    const svg = useRef<Svg>(null);
    const active = useRef<AbortController | null>(null);
    const mounted = useRef(true);
    const [source, setSource] = useState<{
      id: string;
      base64: string;
      width: number;
      height: number;
      settings: Disclosure;
      capture: ReturnType<typeof createDisclosureCapture>;
    } | null>(null);
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        active.current?.abort();
      };
    }, []);
    useImperativeHandle(
      ref,
      () => ({
        render: async (uri, input, own, allocate) => {
          if (Platform.OS === "web")
            throw new Error(
              "Use the native build to export full-resolution photos.",
            );
          if (!mounted.current || active.current)
            throw new DisclosureExportError(
              "The photo renderer is unavailable or busy.",
            );
          const controller = new AbortController();
          active.current = controller;
          try {
            const settings = validatedDisclosure(input);
            const prepared = await prepareDisclosureJpeg(
              () => jpegContext(uri),
              (path) => {
                own(new File(path));
              },
              controller.signal,
              { compress: 1, base64: settings.enabled && !!settings.text },
            );
            let outputUri = prepared.uri;
            if (settings.enabled && settings.text) {
              const capture = createDisclosureCapture({
                dimensions: prepared,
                signal: controller.signal,
                frame: (work) => {
                  const frame = requestAnimationFrame(work);
                  return () => cancelAnimationFrame(frame);
                },
                render: (done, dimensions) => {
                  if (!svg.current) throw new Error("Renderer unavailable");
                  svg.current.toDataURL(done, dimensions);
                },
              });
              setSource({
                id: Crypto.randomUUID(),
                base64: prepared.base64!,
                width: prepared.width,
                height: prepared.height,
                settings,
                capture,
              });
              const data = await capture.promise;
              const png = own(allocate("label"));
              png.create();
              png.write(data, { encoding: "base64" });
              const jpeg = await prepareDisclosureJpeg(
                () => jpegContext(png.uri),
                (path) => {
                  own(new File(path));
                },
                controller.signal,
                { compress: 0.97, base64: false, expected: prepared },
              );
              outputUri = jpeg.uri;
            }
            const final = own(allocate("final"));
            await new File(outputUri).copy(final);
            if (controller.signal.aborted || !mounted.current)
              throw new DisclosureExportError(
                "The photo export was cancelled.",
              );
            if (!final.exists || final.size <= 0)
              throw new DisclosureExportError(
                "The finished photo could not be copied. Check available storage and try again.",
              );
            return final;
          } catch (error) {
            if (error instanceof DisclosureExportError) throw error;
            throw new DisclosureExportError(
              "The photo could not be exported. Check your disclosure settings and available storage, then try again.",
            );
          } finally {
            controller.abort();
            active.current = null;
            if (mounted.current) setSource(null);
          }
        },
      }),
      [],
    );
    return (
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: -10000, width: 1, height: 1 }}
      >
        {!!source && (
          <Svg
            key={source.id}
            ref={svg}
            width={1}
            height={1}
            viewBox={`0 0 ${source.width} ${source.height}`}
          >
            <SvgImage
              href={`data:image/jpeg;base64,${source.base64}`}
              width={source.width}
              height={source.height}
              onLoad={() => source.capture.ready("image")}
            />
            <DisclosureText
              settings={source.settings}
              width={source.width}
              height={source.height}
              onReady={() => source.capture.ready("text")}
              onError={source.capture.fail}
            />
          </Svg>
        )}
      </View>
    );
  },
);
