import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { AssistantStatus } from "@/context/AssistantContext";

function getOrbColor(status: AssistantStatus): string {
  switch (status) {
    case "listening": return "#00FFCC";
    case "thinking":  return "#0099FF";
    case "speaking":  return "#00D4FF";
    case "error":     return "#FF2D55";
    default:          return "#00D4FF";
  }
}

function getRingSpeed(status: AssistantStatus): number {
  switch (status) {
    case "listening": return 500;
    case "thinking":  return 700;
    case "speaking":  return 900;
    default:          return 2200; // Slower idle — saves GPU
  }
}

interface RingProps {
  size: number;
  scale: SharedValue<number>;
  opacity: SharedValue<number>;
  color: string;
  borderWidth?: number;
}

const Ring = React.memo(function Ring({
  size,
  scale,
  opacity,
  color,
  borderWidth = 1,
}: RingProps) {
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: color,
        },
        style,
      ]}
    />
  );
});

interface VoxOrbProps {
  status: AssistantStatus;
  size?: number;
}

export const VoxOrb = React.memo(function VoxOrb({ status, size = 100 }: VoxOrbProps) {
  const color = getOrbColor(status);
  const speed = getRingSpeed(status);
  const isIdle = status === "idle";

  const ring1Scale   = useSharedValue(1);
  const ring2Scale   = useSharedValue(1);
  const ring3Scale   = useSharedValue(1);
  const ring1Opacity = useSharedValue(0.35);
  const ring2Opacity = useSharedValue(0.20);
  const ring3Opacity = useSharedValue(0.08);
  const corePulse    = useSharedValue(1);
  const rotateScan   = useSharedValue(0);
  const scanOpacity  = useSharedValue(isIdle ? 0.2 : 0.6);

  useEffect(() => {
    // Cancel orphaned animations from the previous status before starting new ones
    cancelAnimation(ring1Scale);
    cancelAnimation(ring2Scale);
    cancelAnimation(ring3Scale);
    cancelAnimation(ring1Opacity);
    cancelAnimation(ring2Opacity);
    cancelAnimation(ring3Opacity);
    cancelAnimation(corePulse);
    cancelAnimation(rotateScan);
    cancelAnimation(scanOpacity);

    // Inner ring — always active
    ring1Scale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: speed, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: speed * 0.8, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );
    ring1Opacity.value = withRepeat(
      withSequence(
        withTiming(0.08, { duration: speed }),
        withTiming(0.38, { duration: speed * 0.8 })
      ),
      -1,
      false
    );

    // Middle ring — skip in idle to reduce GPU load
    if (!isIdle) {
      ring2Scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration: speed * 0.5 }),
          withTiming(1.55, { duration: speed, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: speed, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
      ring2Opacity.value = withRepeat(
        withSequence(
          withTiming(0.20, { duration: speed * 0.5 }),
          withTiming(0.05, { duration: speed }),
          withTiming(0.20, { duration: speed })
        ),
        -1,
        false
      );
    } else {
      // Idle: gentle faint pulse only
      ring2Scale.value = withTiming(1.1, { duration: 600 });
      ring2Opacity.value = withTiming(0.06, { duration: 600 });
    }

    // Outer ring — only active states (listening/thinking/speaking)
    if (!isIdle) {
      ring3Scale.value = withRepeat(
        withSequence(
          withTiming(1, { duration: speed }),
          withTiming(1.85, { duration: speed * 1.2, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: speed, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
      ring3Opacity.value = withRepeat(
        withSequence(
          withTiming(0.08, { duration: speed }),
          withTiming(0.02, { duration: speed * 1.2 }),
          withTiming(0.08, { duration: speed })
        ),
        -1,
        false
      );
    } else {
      ring3Scale.value = withTiming(1, { duration: 400 });
      ring3Opacity.value = withTiming(0, { duration: 400 });
    }

    // Core pulse
    corePulse.value = withRepeat(
      withSequence(
        withTiming(isIdle ? 1.02 : 1.05, { duration: speed * 0.5 }),
        withTiming(isIdle ? 0.98 : 0.95, { duration: speed * 0.5 })
      ),
      -1,
      true
    );

    // Scan arc rotation — slower when idle
    rotateScan.value = withRepeat(
      withTiming(360, { duration: isIdle ? speed * 3 : speed * 2, easing: Easing.linear }),
      -1,
      false
    );

    scanOpacity.value = withTiming(isIdle ? 0.2 : 0.7, { duration: 400 });
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: corePulse.value }],
  }));

  const scanStyle = useAnimatedStyle(() => ({
    opacity: scanOpacity.value,
    transform: [{ rotate: `${rotateScan.value}deg` }],
  }));

  const containerSize = size * 2.2;

  return (
    <View
      style={{ width: containerSize, height: containerSize, alignItems: "center", justifyContent: "center" }}
    >
      {/* Outer ring — visible only when active */}
      <Ring size={size * 1.9} scale={ring3Scale} opacity={ring3Opacity} color={color} borderWidth={0.5} />
      {/* Middle ring */}
      <Ring size={size * 1.5} scale={ring2Scale} opacity={ring2Opacity} color={color} borderWidth={1} />
      {/* Inner ring */}
      <Ring size={size * 1.2} scale={ring1Scale} opacity={ring1Opacity} color={color} borderWidth={1} />

      {/* Core orb */}
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            alignItems: "center",
            justifyContent: "center",
            ...(Platform.OS !== "web" && {
              shadowColor: color,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.95,
              shadowRadius: 30,
              elevation: 24,
            }),
          },
          coreStyle,
        ]}
      >
        {/* Inner frosted layer */}
        <View
          style={{
            width: size * 0.75,
            height: size * 0.75,
            borderRadius: size * 0.375,
            backgroundColor: "rgba(0,0,0,0.25)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.18)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Rotating scan arc */}
          <Animated.View
            style={[
              {
                width: size * 0.5,
                height: size * 0.5,
                borderRadius: size * 0.25,
                borderTopWidth: 2,
                borderTopColor: "rgba(255,255,255,0.7)",
                borderLeftWidth: 1,
                borderLeftColor: "rgba(255,255,255,0.3)",
                borderRightWidth: 0,
                borderBottomWidth: 0,
                borderColor: "transparent",
              },
              scanStyle,
            ]}
          />
          {/* Center dot */}
          <View
            style={{
              position: "absolute",
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "rgba(255,255,255,0.9)",
            }}
          />
        </View>
      </Animated.View>
    </View>
  );
});
