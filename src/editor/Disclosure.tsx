import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Platform, Pressable, Switch, View } from "react-native";
import Svg, { Image as SvgImage, Text as SvgText } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
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
  disclosureSchema,
  fonts,
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
          <Label>Font</Label>
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
}: {
  settings: Disclosure;
  width: number;
  height: number;
}) {
  const point = placement(settings, width, height);
  return settings.enabled && settings.text ? (
    <SvgText
      x={point.x}
      y={point.y}
      textAnchor={point.anchor}
      fontSize={point.size}
      fontFamily={settings.fontFamily}
      fontWeight="bold"
      fill={
        /^#[a-fA-F0-9]{6}$/.test(settings.color) ? settings.color : "#ffffff"
      }
      opacity={settings.opacity}
    >
      {settings.text}
    </SvgText>
  ) : null;
}
export type DisclosureHandle = {
  render: (uri: string, settings: Disclosure) => Promise<File>;
};
export const DisclosureRenderer = forwardRef<DisclosureHandle>(
  function DisclosureRenderer(_, ref) {
    const svg = useRef<Svg>(null);
    const capture = useRef<null | (() => void)>(null);
    const [source, setSource] = useState<{
      base64: string;
      width: number;
      height: number;
      settings: Disclosure;
    } | null>(null);
    useImperativeHandle(
      ref,
      () => ({
        render: async (uri, input) => {
          if (Platform.OS === "web")
            throw new Error(
              "Use the native build to export full-resolution photos.",
            );
          const settings = disclosureSchema.parse(input);
          const image = await ImageManipulator.manipulate(uri).renderAsync();
          const prepared = await image.saveAsync({
            format: SaveFormat.JPEG,
            compress: 1,
            base64: settings.enabled,
          });
          const temporary: File[] = [new File(prepared.uri)];
          try {
            let outputUri = prepared.uri;
            if (settings.enabled && settings.text) {
              const data = await new Promise<string>((resolve, reject) => {
                const timer = setTimeout(() => {
                  capture.current = null;
                  reject(new Error("The photo renderer timed out."));
                }, 15_000);
                capture.current = () => {
                  capture.current = null;
                  requestAnimationFrame(() => {
                    if (!svg.current) {
                      clearTimeout(timer);
                      reject(new Error("Photo renderer is unavailable."));
                      return;
                    }
                    svg.current.toDataURL(
                      (base64) => {
                        clearTimeout(timer);
                        resolve(base64);
                      },
                      { width: prepared.width, height: prepared.height },
                    );
                  });
                };
                setSource({
                  base64: prepared.base64!,
                  width: prepared.width,
                  height: prepared.height,
                  settings,
                });
              });
              const png = new File(
                Paths.cache,
                `furnio-label-${Crypto.randomUUID()}.png`,
              );
              png.create();
              png.write(data, { encoding: "base64" });
              temporary.push(png);
              const composed = await ImageManipulator.manipulate(
                png.uri,
              ).renderAsync();
              const jpeg = await composed.saveAsync({
                format: SaveFormat.JPEG,
                compress: 0.97,
              });
              outputUri = jpeg.uri;
              temporary.push(new File(jpeg.uri));
            }
            const final = new File(
              Paths.cache,
              `Furnio-${Crypto.randomUUID()}.jpg`,
            );
            new File(outputUri).copy(final);
            return final;
          } finally {
            capture.current = null;
            setSource(null);
            for (const file of temporary) if (file.exists) file.delete();
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
            ref={svg}
            width={1}
            height={1}
            viewBox={`0 0 ${source.width} ${source.height}`}
          >
            <SvgImage
              href={`data:image/jpeg;base64,${source.base64}`}
              width={source.width}
              height={source.height}
              onLoad={() => capture.current?.()}
            />
            <DisclosureText
              settings={source.settings}
              width={source.width}
              height={source.height}
            />
          </Svg>
        )}
      </View>
    );
  },
);
