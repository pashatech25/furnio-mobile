import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Svg, { Path } from "react-native-svg";
import { stopOptionalAudio } from "./audio-cleanup";

// Website hero-trial-script uses --color-accent-hover for text and currentColor underline.
const trialBadgeColor = "#a84d30";

// Preserve web lettering; owner-supplied pencil clip sets the full reveal length.
export function TrialBadge({ enabled, limit }: { enabled: boolean; limit: number }) {
  const writing = useRef(new Animated.Value(0)).current;
  const underline = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState<boolean | null>(null);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const player = useAudioPlayer(require("../assets/pencil-writing.mp3"));
  const { isLoaded } = useAudioPlayerStatus(player);
  const [audioWaitExpired, setAudioWaitExpired] = useState(false);
  const audioReady = isLoaded || audioWaitExpired;
  useEffect(() => {
    const timeout = setTimeout(() => setAudioWaitExpired(true), 3000);
    return () => clearTimeout(timeout);
  }, []);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(
      value => { if (alive) setReduce(value); },
      () => { if (alive) setReduce(true); },
    );
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => { alive = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    // Stay hidden until the accessibility preference is known. Assuming reduced
    // motion initially reveals the finished badge before resetting its animation.
    if (!enabled || !focused || reduce === null) { writing.setValue(0); underline.setValue(0); return; }
    if (reduce) { writing.setValue(1); underline.setValue(1); return; }
    if (!audioReady) return;
    writing.setValue(0); underline.setValue(0);
    // ffprobe: supplied original MP3 is 2.952 seconds. Prefer decoded duration.
    const duration = player.isLoaded && player.duration > 0 ? Math.round(player.duration * 1000) : 2952;
    const textDuration = Math.round(duration * 0.72);
    const animation = Animated.sequence([
      Animated.timing(writing, { toValue: 1, duration: textDuration, easing: Easing.linear, useNativeDriver: false }),
      Animated.timing(underline, { toValue: 1, duration: duration - textDuration, easing: Easing.linear, useNativeDriver: false }),
    ]);
    let cancelled = false;
    async function start() {
      try {
        await setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: "mixWithOthers", allowsRecording: false });
        if (cancelled) return;
        if (player.isLoaded) {
          await player.seekTo(0);
          if (cancelled) return;
          player.volume = 0.4;
          player.play();
        }
      } catch { /* Audio failure must not hide the promotion or block login. */ }
      if (!cancelled) animation.start();
    }
    void start();
    const background = AppState.addEventListener("change", state => {
      if (state !== "active") {
        cancelled = true;
        stopOptionalAudio(player); animation.stop(); writing.setValue(1); underline.setValue(1);
      }
    });
    return () => { cancelled = true; background.remove(); animation.stop(); stopOptionalAudio(player); };
  }, [enabled, focused, reduce, audioReady, player, writing, underline]);
  if (!enabled || !Number.isInteger(limit) || limit < 1) return null;
  return <View accessibilityLabel={`${limit} edits on us`} style={{ position: "absolute", right: 23, top: 87, width: 210, transform: [{ rotate: "-4deg" }] }}>
    <Animated.View style={{ width: writing.interpolate({inputRange:[0,1],outputRange:[0,210]}), overflow: "hidden" }}>
      <Text style={{ width: 210, fontFamily: "Caveat", fontSize: 40, lineHeight: 48, color: trialBadgeColor }}>{limit} edits on us</Text>
    </Animated.View>
    <Animated.View style={{ width: underline.interpolate({inputRange:[0,1],outputRange:[0,210]}), overflow: "hidden" }}>
      <Svg width={210} height={12} viewBox="0 0 210 12"><Path d="M3 8.4c47-4.2 103-6.1 204-3.3" fill="none" stroke={trialBadgeColor} strokeWidth={2.2} strokeLinecap="round" /></Svg>
    </Animated.View>
  </View>;
}
