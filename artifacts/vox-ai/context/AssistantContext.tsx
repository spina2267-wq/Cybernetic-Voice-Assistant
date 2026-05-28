import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";

export type AssistantStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AssistantContextType {
  messages: Message[];
  status: AssistantStatus;
  setStatus: (status: AssistantStatus) => void;
  addMessage: (message: Message) => void;
  updateLastAssistantMessage: (content: string) => void;
  clearHistory: () => Promise<void>;
  ttsEnabled: boolean;
  setTtsEnabled: (enabled: boolean) => void;
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
}

const AssistantContext = createContext<AssistantContextType | null>(null);

const MESSAGES_KEY = "@vox_messages_v2";
const SETTINGS_KEY = "@vox_settings_v2";
const MAX_MESSAGES = 100;

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatusState] = useState<AssistantStatus>("idle");
  const [ttsEnabled, setTtsEnabledState] = useState(true);
  const [selectedVoice, setSelectedVoiceState] = useState("alloy");
  const statusRef = useRef<AssistantStatus>("idle");

  const setStatus = useCallback((s: AssistantStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  // Load persisted data on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedMsgs, savedSettings] = await Promise.all([
          AsyncStorage.getItem(MESSAGES_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
        ]);
        if (savedMsgs) setMessages(JSON.parse(savedMsgs).slice(0, MAX_MESSAGES));
        if (savedSettings) {
          const s = JSON.parse(savedSettings);
          if (s.ttsEnabled !== undefined) setTtsEnabledState(s.ttsEnabled);
          if (s.selectedVoice) setSelectedVoiceState(s.selectedVoice);
        }
      } catch {
        // Ignore storage errors
      }
    })();
  }, []);

  // Handle app going to background — reset active states to prevent stuck UI
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        if (statusRef.current === "listening" || statusRef.current === "thinking") {
          setStatus("idle");
        }
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [setStatus]);

  const persistMessages = useCallback((msgs: Message[]) => {
    AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs.slice(0, MAX_MESSAGES))).catch(() => {});
  }, []);

  const addMessage = useCallback(
    (message: Message) => {
      setMessages((prev) => {
        const next = [message, ...prev].slice(0, MAX_MESSAGES);
        persistMessages(next);
        return next;
      });
    },
    [persistMessages]
  );

  const updateLastAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[0] = { ...next[0], content };
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setMessages([]);
    await AsyncStorage.removeItem(MESSAGES_KEY).catch(() => {});
  }, []);

  const setTtsEnabled = useCallback(
    (enabled: boolean) => {
      setTtsEnabledState(enabled);
      const s = { ttsEnabled: enabled, selectedVoice };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s)).catch(() => {});
    },
    [selectedVoice]
  );

  const setSelectedVoice = useCallback(
    (voice: string) => {
      setSelectedVoiceState(voice);
      const s = { ttsEnabled, selectedVoice: voice };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s)).catch(() => {});
    },
    [ttsEnabled]
  );

  return (
    <AssistantContext.Provider
      value={{
        messages,
        status,
        setStatus,
        addMessage,
        updateLastAssistantMessage,
        clearHistory,
        ttsEnabled,
        setTtsEnabled,
        selectedVoice,
        setSelectedVoice,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used within AssistantProvider");
  return ctx;
}
