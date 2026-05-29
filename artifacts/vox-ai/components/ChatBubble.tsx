import React, { memo, useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Message } from "@/context/AssistantContext";

function Dot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    const timer = setTimeout(() => {
      opacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1,
        false
      );
    }, delay);

    return () => {
      clearTimeout(timer);
      // Cancel the Reanimated animation when the dot unmounts or delay changes
      cancelAnimation(opacity);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, style]} />;
}

function TypingIndicator() {
  return (
    <View style={styles.typingRow}>
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}

interface ChatBubbleProps {
  message: Message;
  isTyping?: boolean;
}

export const ChatBubble = memo(function ChatBubble({ message, isTyping }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isEmpty = message.content === "";

  return (
    <Animated.View
      entering={Platform.OS !== "web" ? FadeInDown.duration(260).springify() : undefined}
      style={[styles.wrapper, isUser ? styles.userWrapper : styles.assistantWrapper]}
    >
      {isUser ? (
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      ) : (
        <View style={styles.assistantRow}>
          <View style={styles.avatar}>
            <View style={styles.avatarInner} />
          </View>
          <View style={styles.assistantBubble}>
            {isEmpty && isTyping ? (
              <TypingIndicator />
            ) : (
              <>
                <Text style={styles.assistantLabel}>VOX AI</Text>
                <Text style={styles.assistantText}>
                  {message.content || "..."}
                </Text>
              </>
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
    marginHorizontal: 12,
  },
  userWrapper: {
    alignItems: "flex-end",
  },
  assistantWrapper: {
    alignItems: "flex-start",
  },
  userBubble: {
    backgroundColor: "#001E30",
    borderWidth: 1,
    borderColor: "#004466",
    borderRadius: 20,
    borderBottomRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: "80%",
  },
  userText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    color: "#D0EEFF",
  },
  assistantRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    maxWidth: "88%",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#00D4FF",
    backgroundColor: "#000D18",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  avatarInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#00D4FF",
  },
  assistantBubble: {
    flex: 1,
    backgroundColor: "#020C18",
    borderWidth: 1,
    borderColor: "#003355",
    borderRadius: 20,
    borderTopLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  assistantLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#00D4FF",
    letterSpacing: 3,
    marginBottom: 5,
  },
  assistantText: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: "Inter_400Regular",
    color: "#C0E8F8",
  },
  typingRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    height: 24,
    paddingHorizontal: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#00D4FF",
  },
});
