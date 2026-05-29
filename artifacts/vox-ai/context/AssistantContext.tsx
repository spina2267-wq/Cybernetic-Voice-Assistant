import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAppLifecycle } from "@/hooks/useAppLifecycle";

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
  commitLastAssistantMessage: () => void;
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
const STALE_STATUS_MS = 45_000;

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatusState] = useState<AssistantStatus>("idle");
  const [ttsEnabled, setTtsEnabledState] = useState(true);
  const [selectedVoice, setSelectedVoiceState] = useState("alloy");

  const statusRef = useRef<AssistantStatus>("idle");
  const statusChangedAtRef = useRef<number>(Date.now());
  // Ref to the live messages array so persist callbacks never go stale
  const messagesRef = useRef<Message[]>([]);

  const setStatus = useCallback((s: AssistantStatus) => {
    statusRef.current = s;
    statusChangedAtRef.current = Date.now();
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
        if (savedMsgs) {
          const parsed = JSON.parse(savedMsgs).slice(0, MAX_MESSAGES);
          setMessages(parsed);
          messagesRef.current = parsed;
        }
        if (savedSettings) {
          const s = JSON.parse(savedSettings);
          if (s.ttsEnabled !== undefined) setTtsEnabledState(s.ttsEnabled);
          if (s.selectedVoice) setSelectedVoiceState(s.selectedVoice);
        }
      } catch {
        // Non-fatal — fresh start
      }
    })();
  }, []);

  // Lifecycle: reset stale states on foreground, clean up on background
  useAppLifecycle({
    onBackground: useCallback(() => {
      const current = statusRef.current;
      if (current === "listening" || current === "thinking") {
        setStatus("idle");
      }
    }, [setStatus]),

    onForeground: useCallback((backgroundDurationMs: number) => {
      const current = statusRef.current;
      const staleMs = Date.now() - statusChangedAtRef.current;

      const isStuck =
        (current === "thinking" || current === "listening" || current === "speaking") &&
        staleMs > STALE_STATUS_MS;

      const longAbsence = backgroundDurationMs > 5 * 60 * 1000;

      if (isStuck || (longAbsence && current !== "idle")) {
        setStatus("idle");
      }
    }, [setStatus]),
  });

  const persistMessages = useCallback((msgs: Message[]) => {
    AsyncStorage.setItem(
      MESSAGES_KEY,
      JSON.stringify(msgs.slice(0, MAX_MESSAGES))
    ).catch(() => {});
  }, []);

  const addMessage = useCallback(
    (message: Message) => {
      setMessages((prev) => {
        const next = [message, ...prev].slice(0, MAX_MESSAGES);
        messagesRef.current = next;
        persistMessages(next);
        return next;
      });
    },
    [persistMessages]
  );

  // Updates the latest assistant message in state WITHOUT persisting.
  // Called many times per stream tick — avoid I/O on every token.
  const updateLastAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[0] = { ...next[0], content };
      messagesRef.current = next;
      return next;
    });
  }, []);

  // Call once after the stream completes to flush the final content to storage.
  const commitLastAssistantMessage = useCallback(() => {
    persistMessages(messagesRef.current);
  }, [persistMessages]);

  const clearHistory = useCallback(async () => {
    setMessages([]);
    messagesRef.current = [];
    await AsyncStorage.removeItem(MESSAGES_KEY).catch(() => {});
  }, []);

  const setTtsEnabled = useCallback(
    (enabled: boolean) => {
      setTtsEnabledState(enabled);
      AsyncStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ ttsEnabled: enabled, selectedVoice })
      ).catch(() => {});
    },
    [selectedVoice]
  );

  const setSelectedVoice = useCallback(
    (voice: string) => {
      setSelectedVoiceState(voice);
      AsyncStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ ttsEnabled, selectedVoice: voice })
      ).catch(() => {});
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
        commitLastAssistantMessage,
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
