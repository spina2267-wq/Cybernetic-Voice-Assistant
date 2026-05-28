import React from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useAssistant, Message } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function MessageItem({ message }: { message: Message }) {
  const colors = useColors();
  const isUser = message.role === "user";

  return (
    <View style={[styles.msgItem, { borderBottomColor: colors.border }]}>
      <View style={styles.msgHeader}>
        <Text
          style={[
            styles.msgRole,
            { color: isUser ? colors.mutedForeground : colors.primary },
          ]}
        >
          {isUser ? "YOU" : "VOX"}
        </Text>
        <Text style={[styles.msgTime, { color: colors.mutedForeground }]}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>
      <Text
        style={[styles.msgContent, { color: colors.foreground }]}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {message.content || "..."}
      </Text>
    </View>
  );
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { messages, clearHistory } = useAssistant();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.primary }]}>HISTORY</Text>
        {messages.length > 0 ? (
          <Pressable
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              clearHistory();
            }}
            style={styles.iconBtn}
          >
            <Ionicons name="trash-outline" size={20} color={colors.destructive} />
          </Pressable>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubble-outline" size={40} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
            No conversations yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.border }]}>
            Start chatting with VOX AI
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageItem message={item} />}
          contentContainerStyle={{ paddingBottom: botPad + 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  iconBtn: { padding: 8 },
  headerTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
  },
  msgItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  msgHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  msgRole: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
  },
  msgTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  msgContent: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
