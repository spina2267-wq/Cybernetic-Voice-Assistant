import React, { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { AssistantStatus } from "@/context/AssistantContext";

const STATUS_LABEL: Record<AssistantStatus, string> = {
  idle:      "READY",
  listening: "LISTENING",
  thinking:  "PROCESSING",
  speaking:  "SPEAKING",
  error:     "ERROR",
};

const STATUS_COLOR: Record<AssistantStatus, string> = {
  idle:      "#00D4FF",
  listening: "#00FFCC",
  thinking:  "#0099FF",
  speaking:  "#00D4FF",
  error:     "#FF2D55",
};

interface StatusIndicatorProps {
  status: AssistantStatus;
  compact?: boolean;
}

export const StatusIndicator = memo(function StatusIndicator({ status, compact }: StatusIndicatorProps) {
  const dotOpacity = useSharedValue(1);
  const color = STATUS_COLOR[status];
  const isActive = status !== "idle";

  useEffect(() => {
    cancelAnimation(dotOpacity);

    if (isActive) {
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.15, { duration: 450 }),
          withTiming(1, { duration: 450 })
        ),
        -1,
        false
      );
    } else {
      dotOpacity.value = withTiming(1, { duration: 300 });
    }

    // Cancel on unmount or before next effect run
    return () => cancelAnimation(dotOpacity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Animated.View style={[styles.dot, { backgroundColor: color }, dotStyle]} />
        <Text style={[styles.compactText, { color }]}>{STATUS_LABEL[status]}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.dot, { backgroundColor: color }, dotStyle]} />
      <Text style={[styles.text, { color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 6,
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#010A14",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#002233",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
  },
  compactText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
  },
});
