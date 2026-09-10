import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, Image, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

// Same assets and 6.4s keyframe positions as web application.css ref-place-*.
export function ReferencePreview() {
  const progress = useRef(new Animated.Value(100)).current;
  const [focused, setFocused] = useState(false);
  const [reduce, setReduce] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduce(value); });
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    const app = AppState.addEventListener("change", state => setActive(state === "active"));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (reduce || !focused || !active) { progress.setValue(100); return; }
    progress.setValue(0);
    const loop = Animated.loop(Animated.timing(progress, { toValue: 100, duration: 6400, easing: Easing.linear, useNativeDriver: false, isInteraction: false }));
    loop.start(); return () => loop.stop();
  }, [reduce, focused, active, progress]);
  const interpolate = (inputRange: number[], outputRange: number[] | string[]) => progress.interpolate({ inputRange, outputRange, extrapolate: "clamp" });
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Image source={require("../assets/service-previews/reference-before.jpg")} style={StyleSheet.absoluteFill} />
    <Animated.Image source={require("../assets/service-previews/reference-sofa.png")} resizeMode="contain" style={{ position: "absolute", height: "45%", left: interpolate([7,30],["62%","14%"]), top: interpolate([7,30],["4%","34%"]), width: interpolate([7,30],["26%","48%"]), opacity: interpolate([0,7,11,46,58,100],[0,0,1,1,0,0]), transform: [{rotate: interpolate([7,30],["-9deg","0deg"])}, {scale: interpolate([7,30],[0.86,1])}] }} />
    <Animated.Image source={require("../assets/service-previews/reference-table.png")} resizeMode="contain" style={{ position: "absolute", height: "30%", left: interpolate([18,36],["72%","34%"]), top: interpolate([18,36],["32%","58%"]), width: interpolate([18,36],["16%","22%"]), opacity: interpolate([0,18,22,46,58,100],[0,0,1,1,0,0]), transform: [{rotate: interpolate([18,36],["8deg","0deg"])}, {scale: interpolate([18,36],[0.86,1])}] }} />
    {[{n:1,left:"36%" as const,top:"72%" as const,start:26,end:32},{n:2,left:"44%" as const,top:"84%" as const,start:32,end:38}].map(pin => <Animated.View key={pin.n} style={{position:"absolute",left:pin.left,top:pin.top,width:22,height:22,marginLeft:-11,marginTop:-11,borderRadius:11,borderWidth:2,borderColor:"#f8f6f1",backgroundColor:"#315b43",alignItems:"center",justifyContent:"center",opacity:interpolate([0,pin.start,pin.end,46,54,100],[0,0,1,1,0,0])}}><Text style={{color:"#fff",fontSize:10,fontWeight:"800"}}>{pin.n}</Text></Animated.View>)}
    <Animated.Image source={require("../assets/service-previews/reference-after.jpg")} style={[StyleSheet.absoluteFill,{opacity:interpolate([0,46,62,100],[0,0,1,1])}]} />
  </View>;
}
