import { Ionicons } from "@expo/vector-icons";
import { reloadAppAsync } from "expo";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

function BlinkingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.1, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      false
    );
    return () => cancelAnimation(opacity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, style]} />;
}

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const insets = useSafeAreaInsets();
  const [showDetails, setShowDetails] = useState(false);

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch {
      resetError();
    }
  };

  const monoFont = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  const errorCode = `ERR_${Date.now().toString(36).toUpperCase().slice(-6)}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      {/* Background scanline effect */}
      <View style={styles.scanOverlay} pointerEvents="none" />

      {/* Header */}
      <View style={styles.header}>
        <BlinkingDot />
        <Text style={styles.headerLabel}>SYSTEM ALERT</Text>
        <BlinkingDot />
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Error icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="warning-outline" size={36} color="#FF2D55" />
        </View>

        {/* Title */}
        <Text style={styles.title}>CRITICAL ERROR</Text>
        <Text style={styles.subtitle}>VOX AI — SYSTEM FAULT DETECTED</Text>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Error brief */}
        <View style={styles.errorCard}>
          <Text style={styles.errorCode}>{errorCode}</Text>
          <Text style={styles.errorMessage} numberOfLines={3}>
            {error.message || "Unknown system error"}
          </Text>
        </View>

        {/* Action buttons */}
        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
        >
          <Ionicons name="refresh" size={16} color="#000000" style={{ marginRight: 8 }} />
          <Text style={styles.primaryBtnText}>REINITIALIZE SYSTEM</Text>
        </Pressable>

        <Pressable
          onPress={resetError}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
        >
          <Text style={styles.secondaryBtnText}>ATTEMPT RECOVERY</Text>
        </Pressable>

        {/* Dev details */}
        {__DEV__ && (
          <Pressable onPress={() => setShowDetails(true)} style={styles.detailsLink}>
            <Text style={styles.detailsLinkText}>VIEW DIAGNOSTIC REPORT</Text>
          </Pressable>
        )}
      </View>

      {/* Footer */}
      <Text style={styles.footer}>VOX AI  •  ADVANCED INTELLIGENCE SYSTEM</Text>

      {/* Dev modal */}
      {__DEV__ && (
        <Modal
          visible={showDetails}
          animationType="slide"
          transparent
          onRequestClose={() => setShowDetails(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>DIAGNOSTIC REPORT</Text>
                <Pressable onPress={() => setShowDetails(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color="#00D4FF" />
                </Pressable>
              </View>
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
                showsVerticalScrollIndicator
              >
                <Text style={[styles.stackTrace, { fontFamily: monoFont }]} selectable>
                  {`Error: ${error.message}\n\n${error.stack ?? "No stack trace"}`}
                </Text>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#FF2D5511",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  headerLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#FF2D55",
    letterSpacing: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#FF2D55",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
    maxWidth: 400,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: "#FF2D5566",
    backgroundColor: "#1A0008",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FF2D55",
    letterSpacing: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: "#5A1020",
    letterSpacing: 3,
    textAlign: "center",
    marginTop: -8,
  },
  divider: {
    height: 1,
    width: "80%",
    backgroundColor: "#330010",
  },
  errorCard: {
    width: "100%",
    backgroundColor: "#0D0004",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF2D5522",
    padding: 16,
    gap: 6,
  },
  errorCode: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#FF2D5566",
    letterSpacing: 3,
  },
  errorMessage: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#C08090",
    lineHeight: 20,
  },
  primaryBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF2D55",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  primaryBtnPressed: {
    backgroundColor: "#CC2244",
    transform: [{ scale: 0.98 }],
  },
  primaryBtnText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#000000",
    letterSpacing: 3,
  },
  secondaryBtn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#333333",
    paddingVertical: 12,
  },
  secondaryBtnPressed: {
    backgroundColor: "#111111",
  },
  secondaryBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#666666",
    letterSpacing: 3,
  },
  detailsLink: {
    paddingVertical: 8,
  },
  detailsLinkText: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: "#FF2D5555",
    letterSpacing: 2,
    textDecorationLine: "underline",
  },
  footer: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: "#1A0008",
    letterSpacing: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#030006",
    borderTopWidth: 1,
    borderTopColor: "#FF2D5533",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1A0010",
  },
  modalTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#00D4FF",
    letterSpacing: 3,
  },
  closeBtn: {
    padding: 4,
  },
  modalScroll: { flex: 1 },
  stackTrace: {
    fontSize: 11,
    color: "#FF2D5588",
    lineHeight: 18,
  },
});
