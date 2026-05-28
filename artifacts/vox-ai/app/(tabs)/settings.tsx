import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useAssistant } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";

const VOICES = [
  { id: "alloy", name: "Alloy", desc: "Balanced, neutral" },
  { id: "echo", name: "Echo", desc: "Clear, resonant" },
  { id: "fable", name: "Fable", desc: "Expressive, warm" },
  { id: "onyx", name: "Onyx", desc: "Deep, authoritative" },
  { id: "nova", name: "Nova", desc: "Friendly, upbeat" },
  { id: "shimmer", name: "Shimmer", desc: "Soft, breathy" },
];

function SectionHeader({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
      {title}
    </Text>
  );
}

function SettingRow({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ttsEnabled, setTtsEnabled, selectedVoice, setSelectedVoice, clearHistory } =
    useAssistant();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const handleClearHistory = () => {
    Alert.alert(
      "Clear History",
      "This will permanently delete all conversation history. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await clearHistory();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.primary }]}>SETTINGS</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Voice Output */}
        <SectionHeader title="VOICE OUTPUT" />
        <View
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <SettingRow
            title="Text-to-Speech"
            subtitle="VOX speaks responses aloud"
            right={
              <Switch
                value={ttsEnabled}
                onValueChange={(val) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTtsEnabled(val);
                }}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor={colors.primaryForeground}
              />
            }
          />
        </View>

        {/* Voice Selection */}
        <SectionHeader title="VOICE CHARACTER" />
        <View
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          {VOICES.map((v, i) => (
            <Pressable
              key={v.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedVoice(v.id);
              }}
              style={[
                styles.voiceRow,
                i < VOICES.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                  {v.name}
                </Text>
                <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>
                  {v.desc}
                </Text>
              </View>
              {selectedVoice === v.id && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </Pressable>
          ))}
        </View>

        {/* System */}
        <SectionHeader title="SYSTEM" />
        <View
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <SettingRow
            title="AI Engine"
            subtitle="OpenAI GPT (via API key or Replit credits)"
          />
          <SettingRow
            title="API Key"
            subtitle="Set OPENAI_API_KEY in Replit Secrets"
          />
        </View>

        {/* Danger zone */}
        <SectionHeader title="DATA" />
        <Pressable
          onPress={handleClearHistory}
          style={[
            styles.dangerBtn,
            { backgroundColor: colors.card, borderColor: colors.destructive },
          ]}
        >
          <Ionicons name="trash-outline" size={18} color={colors.destructive} />
          <Text style={[styles.dangerText, { color: colors.destructive }]}>
            Clear All History
          </Text>
        </Pressable>

        {/* About */}
        <View style={styles.about}>
          <Text style={[styles.aboutText, { color: colors.mutedForeground }]}>
            VOX AI  •  v1.0.0
          </Text>
          <Text style={[styles.aboutText, { color: colors.mutedForeground }]}>
            Advanced Intelligence System
          </Text>
        </View>
      </ScrollView>
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
  backBtn: { padding: 8 },
  headerTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
  },
  content: { padding: 16, gap: 8 },
  sectionHeader: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 3,
    marginTop: 16,
    marginBottom: 6,
    marginLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  dangerText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  about: {
    alignItems: "center",
    gap: 4,
    marginTop: 32,
  },
  aboutText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    letterSpacing: 1,
  },
});
