import React, { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

const COMMANDS = [
  { label: "What time is it?",   icon: "time-outline" as const,           color: "#00D4FF" },
  { label: "Tell me a fact",     icon: "star-outline" as const,           color: "#00FFCC" },
  { label: "Write something",    icon: "create-outline" as const,         color: "#00D4FF" },
  { label: "Explain this",       icon: "bulb-outline" as const,           color: "#00FFCC" },
  { label: "Summarize text",     icon: "list-outline" as const,           color: "#00D4FF" },
  { label: "System status",      icon: "hardware-chip-outline" as const,  color: "#00FFCC" },
];

interface QuickCommandsProps {
  onCommand: (text: string) => void;
}

export const QuickCommands = memo(function QuickCommands({ onCommand }: QuickCommandsProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionLabel}>QUICK COMMANDS</Text>
      <View style={styles.grid}>
        {COMMANDS.map((cmd) => (
          <Pressable
            key={cmd.label}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCommand(cmd.label);
            }}
            style={({ pressed }) => [
              styles.tile,
              pressed && styles.tilePressed,
            ]}
          >
            <View style={[styles.iconWrap, { borderColor: cmd.color + "44" }]}>
              <Ionicons name={cmd.icon} size={18} color={cmd.color} />
            </View>
            <Text style={[styles.tileText, { color: cmd.color === "#00D4FF" ? "#A0D8EF" : "#A0EFD8" }]}>
              {cmd.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#1A4A60",
    letterSpacing: 3,
    textAlign: "center",
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  tile: {
    width: "46%",
    backgroundColor: "#020C18",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#003355",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tilePressed: {
    backgroundColor: "#031828",
    borderColor: "#00D4FF44",
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: "#000D18",
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 16,
  },
});
