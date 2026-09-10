import { useState } from "react";
import { Image, Pressable, ScrollView, View, type ImageSourcePropType } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { Check } from "lucide-react-native";
import { Body, Label, colors } from "./ui";
import type { VisualChoiceOption } from "./creative-options";

export function VisualChoiceRail({ label, options, selected, onChange, disabled = false, showAll = false, images = {} }: {
  label: string; options: readonly VisualChoiceOption[]; selected: string;
  onChange: (value: string) => void; disabled?: boolean; showAll?: boolean; images?: Record<string, ImageSourcePropType>;
}) {
  const [width, setWidth] = useState(0);
  const cardWidth = Math.max(1, (width - (showAll ? options.length - 1 : 2) * 12) / (showAll ? options.length : 2.5));
  return <View style={{ gap: 12 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Label>{label}</Label>
    <ScrollView horizontal scrollEnabled={!showAll} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 6 }}>
      {options.map(option => {
        const active = option.value === selected;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: active, disabled }} accessibilityLabel={`${label}: ${option.label}`} disabled={disabled} onPress={() => onChange(option.value)}
          style={{ width: cardWidth, aspectRatio: 4 / 3, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: active ? colors.ink : colors.line, backgroundColor: colors.paper, opacity: disabled ? 0.6 : 1 }}>
          <Image source={images[option.value] ?? { uri: option.image }} style={{ width: "100%", height: "100%" }} />
          <Svg pointerEvents="none" width="100%" height="100%" style={{ position: "absolute" }}>
            <Defs><LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#10251c" stopOpacity="0" /><Stop offset="0.4" stopColor="#10251c" stopOpacity="0.12" /><Stop offset="1" stopColor="#10251c" stopOpacity="0.88" /></LinearGradient></Defs>
            <Rect width="100%" height="100%" fill="url(#shade)" />
          </Svg>
          {active && <View style={{ position: "absolute", top: 5, right: 5, padding: 3, borderRadius: 20, backgroundColor: colors.ink }}><Check size={12} color="#f7f3e8" /></View>}
          <Body style={{ position: "absolute", bottom: 7, left: 7, right: 5, fontFamily: "DMBold", fontSize: 12, lineHeight: 15, color: "#f7f3e8" }}>{option.label}</Body>
        </Pressable>;
      })}
    </ScrollView>
    {options.find(option => option.value === selected)?.description && <Body muted>{options.find(option => option.value === selected)?.description}</Body>}
  </View>;
}
