import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useAssistant } from "@/context/AssistantContext";
import { useAIStream } from "@/hooks/useAIStream";
import { useVoice } from "@/hooks/useVoice";
import { useColors } from "@/hooks/useColors";
import { VoxOrb } from "@/components/VoxOrb";
import { Waveform } from "@/components/Waveform";
import { ChatBubble } from "@/components/ChatBubble";
import { StatusIndicator } from "@/components/StatusIndicator";
import { QuickCommands } from "@/components/QuickCommands";
import { StartupAnimation } from "@/components/StartupAnimation";

const { width } = Dimensions.get("window");

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { messages, status } = useAssistant();
  const { sendMessage } = useAIStream();
  const { isRecording, startRecording, stopRecording } = useVoice();

  const [inputText, setInputText] = useState("");
  const [showStartup, setShowStartup] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isSending) return;
    setInputText("");
    setIsSending(true);
    try {
      await sendMessage(text);
    } finally {
      setIsSending(false);
    }
    inputRef.current?.focus();
  };

  const handleMic = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isRecording) {
      const transcribed = await stopRecording();
      if (transcribed) {
        setIsSending(true);
        try {
          await sendMessage(transcribed);
        } finally {
          setIsSending(false);
        }
      }
    } else {
      await startRecording();
    }
  };

  const isEmpty = messages.length === 0;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);
  const canSend = inputText.trim().length > 0;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Background gradient */}
      <LinearGradient
        colors={["#000810", "#000000", "#000000"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {showStartup && (
        <StartupAnimation onComplete={() => setShowStartup(false)} />
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 10 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoMark}>
            <View style={styles.logoInner} />
          </View>
          <Text style={styles.headerTitle}>VOX</Text>
          <Text style={styles.headerSubtitle}> AI</Text>
        </View>

        <StatusIndicator status={status} compact />

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/history");
            }}
            style={styles.iconBtn}
          >
            <Ionicons name="time-outline" size={20} color="#00D4FF" />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/settings");
            }}
            style={styles.iconBtn}
          >
            <Ionicons name="settings-outline" size={20} color="#4DBFD9" />
          </Pressable>
        </View>
      </View>

      {/* Thin separator line */}
      <View style={styles.separator}>
        <LinearGradient
          colors={["transparent", "#00D4FF44", "#00D4FF88", "#00D4FF44", "transparent"]}
          style={{ flex: 1, height: 1 }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </View>

      {/* Main content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {isEmpty ? (
          <View style={styles.emptyContainer}>
            {/* Ambient glow behind orb */}
            <View style={styles.orbGlow} />
            <VoxOrb status={status} size={110} />
            <Text style={styles.welcomeTitle}>How can I help you?</Text>
            <Text style={styles.welcomeSub}>Speak or type to begin</Text>
            <QuickCommands
              onCommand={(cmd) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setIsSending(true);
                sendMessage(cmd).finally(() => setIsSending(false));
              }}
            />
          </View>
        ) : (
          <FlatList
            data={messages}
            inverted
            renderItem={({ item, index }) => (
              <ChatBubble
                message={item}
                isTyping={index === 0 && status === "thinking"}
              />
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Waveform when recording */}
        {isRecording && (
          <View style={styles.waveformRow}>
            <View style={styles.waveformCard}>
              <Text style={styles.listeningText}>LISTENING</Text>
              <Waveform isActive={isRecording} />
            </View>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputArea, { paddingBottom: botPad + 10 }]}>
          <View style={styles.inputCard}>
            {/* Mic button */}
            <Pressable
              onPress={handleMic}
              disabled={isSending && !isRecording}
              style={({ pressed }) => [
                styles.micBtn,
                {
                  backgroundColor: isRecording
                    ? "#00FFCC"
                    : pressed
                    ? "#003344"
                    : "#001A2E",
                  borderColor: isRecording ? "#00FFCC" : "#003366",
                },
              ]}
            >
              <Ionicons
                name={isRecording ? "stop" : "mic"}
                size={18}
                color={isRecording ? "#000000" : "#00D4FF"}
              />
            </Pressable>

            {/* Text input */}
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask VOX anything..."
              placeholderTextColor="#2A6080"
              onSubmitEditing={handleSend}
              returnKeyType="send"
              editable={!isSending}
              multiline={false}
            />

            {/* Send button */}
            <Pressable
              onPress={handleSend}
              disabled={!canSend || isSending}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: canSend
                    ? pressed ? "#009AB8" : "#00D4FF"
                    : "#001A2E",
                  borderColor: canSend ? "#00D4FF" : "#003366",
                  opacity: isSending ? 0.5 : 1,
                },
              ]}
            >
              <Ionicons
                name={canSend ? "send" : "chevron-up"}
                size={16}
                color={canSend ? "#000000" : "#2A6080"}
              />
            </Pressable>
          </View>

          <Text style={styles.inputHint}>
            VOX AI • Advanced Intelligence
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoMark: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#00D4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: "#00D4FF",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#00D4FF",
    letterSpacing: 5,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#00FFCC",
    letterSpacing: 2,
    marginLeft: -4,
  },
  headerRight: {
    flexDirection: "row",
    gap: 2,
  },
  iconBtn: {
    padding: 8,
  },
  separator: {
    height: 1,
    marginBottom: 2,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 12,
    gap: 14,
  },
  orbGlow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "#00D4FF",
    opacity: 0.04,
  },
  welcomeTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: "#E0FFFF",
    letterSpacing: 0.5,
    marginTop: 8,
  },
  welcomeSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#2A6080",
    letterSpacing: 2,
    marginTop: -8,
  },

  // Chat
  messageList: {
    paddingHorizontal: 4,
    paddingVertical: 16,
    flexGrow: 1,
  },

  // Waveform
  waveformRow: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  waveformCard: {
    width: "100%",
    backgroundColor: "#020C14",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#00FFCC44",
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: "center",
    gap: 6,
  },
  listeningText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#00FFCC",
    letterSpacing: 4,
  },

  // Input
  inputArea: {
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 6,
  },
  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#020C14",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#003366",
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 8,
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#E0FFFF",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inputHint: {
    textAlign: "center",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "#1A3A4A",
    letterSpacing: 1,
  },
});
