import { fetch as expoFetch } from "expo/fetch";
import { useAssistant } from "@/context/AssistantContext";
import { useVoice } from "@/hooks/useVoice";
import { useCallback } from "react";

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

const getApiBase = () =>
  `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export function useAIStream() {
  const {
    messages,
    addMessage,
    updateLastAssistantMessage,
    setStatus,
    ttsEnabled,
    selectedVoice,
  } = useAssistant();
  const { speak } = useVoice();

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      // Capture history before adding new messages
      const snapshot = [...messages];

      const userMsg = {
        id: makeId(),
        role: "user" as const,
        content: content.trim(),
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      const assistantMsg = {
        id: makeId(),
        role: "assistant" as const,
        content: "",
        timestamp: Date.now() + 1,
      };
      addMessage(assistantMsg);

      setStatus("thinking");

      let fullContent = "";

      try {
        // Build chronological context (snapshot is newest-first, reverse it)
        const history = snapshot
          .slice(0, 30)
          .reverse()
          .map((m) => ({ role: m.role, content: m.content }));
        const apiMessages = [...history, { role: "user", content: content.trim() }];

        const response = await expoFetch(`${getApiBase()}/vox/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "AI unavailable");
          let errMsg = "AI service unavailable.";
          try {
            const errJson = JSON.parse(errText);
            errMsg = errJson.error || errMsg;
          } catch {
            // use default
          }
          updateLastAssistantMessage(errMsg);
          setStatus("error");
          setTimeout(() => setStatus("idle"), 3000);
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                updateLastAssistantMessage(fullContent);
              }
              if (data.error) throw new Error(data.error);
            } catch {
              // skip invalid chunks
            }
          }
        }

        if (!fullContent) {
          updateLastAssistantMessage("I'm sorry, I couldn't generate a response.");
          setStatus("idle");
          return;
        }

        if (ttsEnabled && fullContent) {
          setStatus("speaking");
          await speak(fullContent, selectedVoice);
        }

        setStatus("idle");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Something went wrong.";
        updateLastAssistantMessage(`Unable to respond: ${msg}`);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    },
    [messages, addMessage, updateLastAssistantMessage, setStatus, ttsEnabled, selectedVoice, speak]
  );

  return { sendMessage };
}
