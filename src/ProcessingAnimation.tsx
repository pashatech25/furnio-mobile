import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { Body } from "./ui";

/** Native rendition of the website's processing mark, orbit and indeterminate line. */
export function ProcessingAnimation({ label = "Preparing your photo…" }: { label?: string }) {
  const turn = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const line = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduce(value); }, () => {});
    const preference = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    const state = AppState.addEventListener("change", value => setActive(value === "active"));
    return () => { alive = false; preference.remove(); state.remove(); };
  }, []);
  useEffect(() => {
    if (reduce || !active || !focused) return;
    const animations = [
      Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])),
      Animated.loop(Animated.timing(line, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true })),
    ];
    animations.forEach(animation => animation.start());
    return () => { animations.forEach(animation => animation.stop()); turn.setValue(0); pulse.setValue(0); line.setValue(0); };
  }, [reduce, active, focused, turn, pulse, line]);
  return <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ backgroundColor: "#111d17", borderRadius: 18, alignItems: "center", padding: 30, gap: 26 }}>
    <View style={{ width: 94, height: 94, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }}>
        <Svg width={52} height={52} viewBox="0 0 64 64"><Path fill="#f7f5ef" transform="translate(22.1 6.5) scale(.742)" d="M26.7,18.2H6.9v-4.5c0-2.7.6-4.8,1.9-6,1.3-1.3,3.2-1.9,5.9-1.9h6V0h-6.4c-1.3,0-2.6,0-3.9.2-1.3.2-2.6.5-3.8,1-1.2.5-2.3,1.3-3.4,2.5-.9,1-1.6,2.1-2.1,3.2-.4,1.2-.7,2.4-.9,3.7-.1,1.3-.2,2.6-.2,3.9v54.2h6.9V24.1h19.8v-5.9Z" /></Svg>
      </Animated.View>
      <Animated.View style={{ position: "absolute", width: 92, height: 92, borderWidth: 1, borderColor: "#e4b28e40", borderRadius: 46, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}><View style={{ position: "absolute", top: 12, left: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: "#e4b28e" }} /></Animated.View>
    </View>
    <Body style={{ color: "#f7f5ef", textAlign: "center" }}>{label}</Body>
    <View style={{ width: 220, height: 2, backgroundColor: "#ffffff20", overflow: "hidden" }}><Animated.View style={{ width: 99, height: 2, backgroundColor: "#e4b28e", transform: [{ translateX: line.interpolate({ inputRange: [0, 1], outputRange: [-109, 243] }) }] }} /></View>
  </View>;
}
