import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, AppState, Image, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import Svg, { Defs, LinearGradient, Stop, Rect, Image as SvgImage, Filter, FeColorMatrix } from "react-native-svg";
import { LockKeyhole } from "lucide-react-native";
import { Body } from "./ui";
import type { Service } from "./services";
import { ReferencePreview } from "./ReferencePreview";

const videos: Record<string, number> = {
  virtual_staging: require("../assets/service-previews/stage.mp4"),
  multiview: require("../assets/service-previews/multiview.mp4"),
  item_removal: require("../assets/service-previews/remove.mp4"),
  custom_staging: require("../assets/service-previews/custom.mp4"),
  twilight: require("../assets/service-previews/twilight.mp4"),
  winter_to_summer: require("../assets/service-previews/winter-to-summer.mp4"),
  exterior_enhancement: require("../assets/service-previews/exterior-enhancement.mp4"),
  floor_plan: require("../assets/service-previews/floor-plan.mp4"),
};
function Motion({ source }: { source: number }) {
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const [reduce, setReduce] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const player = useVideoPlayer(source, player => { player.loop = true; player.muted = true; });
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduce(value); });
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    const app = AppState.addEventListener("change", state => setForeground(state === "active"));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => { if (focused && foreground && !reduce) player.play(); else player.pause(); }, [focused, foreground, reduce, player]);
  return reduce ? null : <VideoView player={player} nativeControls={false} contentFit="cover" surfaceType="textureView" style={StyleSheet.absoluteFill} pointerEvents="none" />;
}
export function ServicePhoto({ service, credits, compact = false, locked = false }: { service: Service; credits?: number; compact?: boolean; locked?: boolean }) {
  return <View style={{ width: "100%", aspectRatio: 4 / 3, overflow: "hidden" }}>
    {locked ? <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs><Filter id="trialGray"><FeColorMatrix type="saturate" values="0" /></Filter></Defs>
      <SvgImage href={service.image} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" filter="url(#trialGray)" />
    </Svg> : <Image source={service.image} style={StyleSheet.absoluteFill} />}
    {!locked && service.id === "reference_furniture" && <ReferencePreview />}
    {!locked && videos[service.id] !== undefined && <Motion source={videos[service.id]!} />}
    <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs><LinearGradient id="serviceShade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0.25" stopColor="#10251c" stopOpacity="0" /><Stop offset="1" stopColor="#10251c" stopOpacity="0.92" /></LinearGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#serviceShade)" />
    </Svg>
    {locked && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#00000038" }]}>
      <LockKeyhole size={34} strokeWidth={1.6} color="#f7f3e8" />
      <Body style={{ color: "#f7f3e8", fontSize: 14, lineHeight: 20, fontFamily: "DMMedium" }}>Not available in trial</Body>
    </View>}
    <View style={{ position: "absolute", left: compact ? 12 : 18, right: 14, bottom: compact ? 12 : 18, gap: 5 }}>
      <Body style={{ color: "#f7f3e8", fontFamily: "DMBold", fontSize: compact ? 15 : 23, lineHeight: compact ? 20 : 28 }}>{service.name}</Body>
      {!locked && !compact && credits !== undefined && <Body style={{ color: "#f7f3e8", fontSize: 12 }}>{credits} credits per output</Body>}
    </View>
  </View>;
}
