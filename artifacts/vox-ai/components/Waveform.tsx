import React, { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

const NUM_BARS = 16;

interface WaveformBarProps {
  index: number;
  isActive: boolean;
  color: string;
}

const WaveformBar = memo(function WaveformBar({ index, isActive, color }: WaveformBarProps) {
  const h = useSharedValue(4);

  useEffect(() => {
    cancelAnimation(h);

    if (!isActive) {
      h.value = withTiming(4, { duration: 300 });
      return;
    }

    // Deterministic wave pattern — taller at center, gentle falloff to edges
    const mid  = NUM_BARS / 2;
    const dist = Math.abs(index - mid);
    const maxH = 52 - dist * 2.5;  // Center bars reach 52px, edges ~32px
    const dur  = 200 + index * 17;

    h.value = withRepeat(
      withSequence(
        withTiming(maxH, { duration: dur,       easing: Easing.inOut(Easing.ease) }),
        withTiming(5,    { duration: dur * 0.9,  easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    return () => { cancelAnimation(h); };
  }, [isActive, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({ height: h.value }));

  // Center bars appear brighter — subtle opacity falloff toward edges
  const mid     = NUM_BARS / 2;
  const dist    = Math.abs(index - mid);
  const opacity = 1 - (dist / mid) * 0.38;

  return (
    <Animated.View
      style={[styles.bar, { backgroundColor: color, opacity }, style]}
    />
  );
});

interface WaveformProps {
  isActive: boolean;
}

export const Waveform = memo(function Waveform({ isActive }: WaveformProps) {
  const colors = useColors();
  const color  = isActive ? colors.accent : colors.primary;

  return (
    <View style={styles.container}>
      {Array.from({ length: NUM_BARS }, (_, i) => (
        <WaveformBar key={i} index={i} isActive={isActive} color={color} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: 64,
    paddingHorizontal: 20,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
});
