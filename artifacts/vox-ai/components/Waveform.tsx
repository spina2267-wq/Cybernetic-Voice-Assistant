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
    // Always cancel the previous animation before starting a new one
    cancelAnimation(h);

    if (!isActive) {
      h.value = withTiming(4, { duration: 300 });
      return;
    }

    // Deterministic wave pattern based on bar index
    const mid = NUM_BARS / 2;
    const dist = Math.abs(index - mid);
    const maxH = 42 - dist * 2.2;
    const dur = 220 + index * 18;

    h.value = withRepeat(
      withSequence(
        withTiming(maxH, { duration: dur, easing: Easing.inOut(Easing.ease) }),
        withTiming(6, { duration: dur, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Cancel on unmount or next effect run
    return () => {
      cancelAnimation(h);
    };
  }, [isActive, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({ height: h.value }));

  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
});

interface WaveformProps {
  isActive: boolean;
}

export const Waveform = memo(function Waveform({ isActive }: WaveformProps) {
  const colors = useColors();
  const color = isActive ? colors.accent : colors.primary;

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
    height: 56,
    paddingHorizontal: 20,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
});
