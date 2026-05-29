import React, { useEffect } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

const DURATION = 2800;

interface StartupAnimationProps {
  onComplete: () => void;
}

export function StartupAnimation({ onComplete }: StartupAnimationProps) {
  // useWindowDimensions: reads current dimensions at render time (rotation-safe)
  const { width, height } = useWindowDimensions();

  const containerOpacity = useSharedValue(1);
  const voxOpacity = useSharedValue(0);
  const voxScale = useSharedValue(0.6);
  const aiOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const progressWidth = useSharedValue(0);
  const statusOpacity = useSharedValue(0);
  const readyOpacity = useSharedValue(0);
  const scanLine = useSharedValue(-height * 0.4);
  const scanOpacity = useSharedValue(0);
  const orbScale = useSharedValue(0);
  const orbOpacity = useSharedValue(0);
  const ring1 = useSharedValue(0.8);
  const ring1Op = useSharedValue(0);

  useEffect(() => {
    // Orb appears first
    orbOpacity.value = withTiming(1, { duration: 300 });
    orbScale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.2)) });

    // Ring pulse
    ring1Op.value = withDelay(200, withRepeat(
      withSequence(withTiming(0.5, { duration: 600 }), withTiming(0, { duration: 600 })),
      -1, false
    ));
    ring1.value = withDelay(200, withRepeat(
      withSequence(withTiming(2.5, { duration: 1200 }), withTiming(0.8, { duration: 0 })),
      -1, false
    ));

    // Scan line
    scanOpacity.value = withDelay(200, withTiming(1, { duration: 200 }));
    scanLine.value = withDelay(200, withRepeat(
      withTiming(height * 0.4, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1, true
    ));

    // VOX text
    voxOpacity.value = withDelay(400, withTiming(1, { duration: 350 }));
    voxScale.value = withDelay(400, withTiming(1, { duration: 400, easing: Easing.out(Easing.back(1.5)) }));

    // AI text
    aiOpacity.value = withDelay(700, withTiming(1, { duration: 300 }));

    // Subtitle
    subtitleOpacity.value = withDelay(900, withTiming(1, { duration: 300 }));

    // Progress bar — fills to actual screen width minus padding
    progressWidth.value = withDelay(
      1000,
      withTiming(width - 80, { duration: 900, easing: Easing.inOut(Easing.quad) })
    );

    // Status text
    statusOpacity.value = withDelay(1000, withTiming(1, { duration: 300 }));

    // Ready
    readyOpacity.value = withDelay(1950, withTiming(1, { duration: 250 }));

    // Fade out
    containerOpacity.value = withDelay(
      2400,
      withTiming(0, { duration: 400, easing: Easing.in(Easing.ease) })
    );

    const timer = setTimeout(onComplete, DURATION);

    // Cancel all animations and timer on unmount (e.g. fast navigation)
    return () => {
      clearTimeout(timer);
      cancelAnimation(orbOpacity);
      cancelAnimation(orbScale);
      cancelAnimation(ring1Op);
      cancelAnimation(ring1);
      cancelAnimation(scanOpacity);
      cancelAnimation(scanLine);
      cancelAnimation(voxOpacity);
      cancelAnimation(voxScale);
      cancelAnimation(aiOpacity);
      cancelAnimation(subtitleOpacity);
      cancelAnimation(progressWidth);
      cancelAnimation(statusOpacity);
      cancelAnimation(readyOpacity);
      cancelAnimation(containerOpacity);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
  const voxStyle = useAnimatedStyle(() => ({
    opacity: voxOpacity.value,
    transform: [{ scale: voxScale.value }],
  }));
  const aiStyle = useAnimatedStyle(() => ({ opacity: aiOpacity.value }));
  const subtitleStyle = useAnimatedStyle(() => ({ opacity: subtitleOpacity.value }));
  const progressStyle = useAnimatedStyle(() => ({ width: progressWidth.value }));
  const statusStyle = useAnimatedStyle(() => ({ opacity: statusOpacity.value }));
  const readyStyle = useAnimatedStyle(() => ({ opacity: readyOpacity.value }));
  const orbStyle = useAnimatedStyle(() => ({
    opacity: orbOpacity.value,
    transform: [{ scale: orbScale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring1Op.value,
    transform: [{ scale: ring1.value }],
  }));
  const scanStyle = useAnimatedStyle(() => ({
    opacity: scanOpacity.value,
    transform: [{ translateY: scanLine.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Background gradient */}
      <LinearGradient
        colors={["#000810", "#000000", "#000811"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Scan line effect */}
      <Animated.View style={[styles.scanLine, scanStyle]} />

      {/* Orb */}
      <Animated.View style={[styles.orbWrap, orbStyle]}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <View style={styles.orb}>
          <View style={styles.orbInner} />
          <View style={styles.orbCenter} />
        </View>
      </Animated.View>

      {/* Logo */}
      <View style={styles.logoRow}>
        <Animated.Text style={[styles.vox, voxStyle]}>VOX</Animated.Text>
        <Animated.Text style={[styles.ai, aiStyle]}> AI</Animated.Text>
      </View>

      {/* Subtitle */}
      <Animated.Text style={[styles.subtitle, subtitleStyle]}>
        ADVANCED INTELLIGENCE SYSTEM
      </Animated.Text>

      {/* Progress */}
      <Animated.View style={[styles.progressTrack, statusStyle, { width: width - 80 }]}>
        <Animated.View style={[styles.progressFill, progressStyle]}>
          <LinearGradient
            colors={["#003355", "#00D4FF", "#00FFCC"]}
            style={{ flex: 1 }}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
        </Animated.View>
      </Animated.View>

      {/* Status */}
      <Animated.Text style={[styles.status, statusStyle]}>
        INITIALIZING NEURAL CORE . . .
      </Animated.Text>

      {/* Ready */}
      <Animated.Text style={[styles.ready, readyStyle]}>
        ◆  SYSTEM READY  ◆
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    gap: 12,
  },
  scanLine: {
    position: "absolute",
    width: "100%",
    height: 1,
    backgroundColor: "#00D4FF",
    opacity: 0.3,
  },

  // Orb section
  orbWrap: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  ring: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: "#00D4FF",
  },
  orb: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#00D4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  orbInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  orbCenter: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.9)",
  },

  // Logo
  logoRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  vox: {
    fontSize: 52,
    fontFamily: "Inter_700Bold",
    color: "#00D4FF",
    letterSpacing: 14,
  },
  ai: {
    fontSize: 32,
    fontFamily: "Inter_400Regular",
    color: "#00FFCC",
    letterSpacing: 6,
  },

  // Meta
  subtitle: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: "#1A6080",
    letterSpacing: 4,
    marginTop: 2,
  },

  // Progress
  progressTrack: {
    height: 2,
    backgroundColor: "#001020",
    borderRadius: 1,
    marginTop: 24,
    overflow: "hidden",
  },
  progressFill: {
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
  },

  // Status
  status: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: "#1A6080",
    letterSpacing: 3,
    marginTop: 4,
  },

  // Ready
  ready: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#00FFCC",
    letterSpacing: 5,
    marginTop: 8,
  },
});
