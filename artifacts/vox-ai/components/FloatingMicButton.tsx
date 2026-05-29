import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

interface FloatingMicButtonProps {
  isRecording: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function FloatingMicButton({ isRecording, onPress, disabled }: FloatingMicButtonProps) {
  const colors = useColors();
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  const btnScale = useSharedValue(1);

  useEffect(() => {
    // Cancel previous animations before starting new ones
    cancelAnimation(ringScale);
    cancelAnimation(ringOpacity);

    if (isRecording) {
      ringOpacity.value = withTiming(1, { duration: 200 });
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 700, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 700, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      ringOpacity.value = withTiming(0, { duration: 200 });
      ringScale.value = withTiming(1, { duration: 300 });
    }

    return () => {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
    };
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handlePress = () => {
    if (disabled) return;
    cancelAnimation(btnScale);
    btnScale.value = withSequence(
      withSpring(0.88, { stiffness: 500, damping: 20 }),
      withSpring(1, { stiffness: 300, damping: 15 })
    );
    Haptics.impactAsync(
      isRecording ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy
    );
    onPress();
  };

  const activeColor = isRecording ? colors.accent : colors.primary;

  return (
    <Pressable onPress={handlePress} disabled={disabled}>
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.ring,
            {
              borderColor: activeColor,
              width: 52,
              height: 52,
              borderRadius: 26,
            },
            ringStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.button,
            {
              backgroundColor: isRecording ? colors.accent : colors.primary,
              shadowColor: activeColor,
            },
            btnStyle,
          ]}
        >
          <Ionicons
            name={isRecording ? "stop" : "mic"}
            size={20}
            color={colors.primaryForeground}
          />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
});
