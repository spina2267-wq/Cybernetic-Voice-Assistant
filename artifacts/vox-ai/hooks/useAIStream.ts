import { fetch as expoFetch } from "expo/fetch";
import { useAssistant } from "@/context/AssistantContext";
import { useVoice } from "@/hooks/useVoice";
import { isAppActive } from "@/hooks/useAppLifecycle";
import { useCallback } from "react";

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

const getApiBase = () => `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

// Retry a fetch once on network failure with a short delay
async function fetchWithRetry(
  url: string,
  options: Parameters<typeof expoFetch>[1],
  retries = 1
): Promise<Response> {
  try {
    return await expoFetch(url, options);
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 1500));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

// Jarvis-style error messages
function toJarvisError(raw: string): string {
  if (raw.toLowerCase().includes("api key") || raw.toLowerCase().includes("unauthorized")) {
    return "Authentication failure. AI credentials not configured.";
  }
  if (raw.toLowerCase().includes("unavailable") || raw.toLowerCase().includes("503")) {
    return "AI subsystem offline. Please try again.";
  }
  if (raw.toLowerCase().includes("timeout") || raw.toLowerCase().includes("aborted")) {
    return "Connection timeout. Signal lost.";
  }
  if (raw.toLowerCase().includes("network") || raw.toLowerCase().includes("fetch")) {
    return "Network unreachable. Check connection.";
  }
  return raw.length > 120 ? "System error. Unable to process request." : raw;
}

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

      // Capture history snapshot before adding new messages (newest-first → reverse for chronological)
      const history = [...messages]
        .slice(0, 30)
        .reverse()
        .map((m) => ({ role: m.role, content: m.content }));

      const userMsg = {
        id: makeId(),
        role: "user" as const,
        content: content.trim(),
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      // Placeholder for streaming assistant response
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
        const apiMessages = [...history, { role: "user", content: content.trim() }];

        const response = await fetchWithRetry(`${getApiBase()}/vox/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          let raw = "AI service unavailable.";
          try {
            const errJson = JSON.parse(errText);
            raw = errJson.error || raw;
          } catch {
            if (errText.length > 0 && errText.length < 200) raw = errText;
          }
          updateLastAssistantMessage(toJarvisError(raw));
          setStatus("error");
          setTimeout(() => setStatus("idle"), 3000);
          return;
        }

        // Stream the response token by token
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
                // Switch from "thinking" to showing content as soon as first token arrives
                if (fullContent.length === data.content.length) {
                  setStatus("thinking"); // keep thinking during stream
                }
              }
              if (data.error) throw new Error(data.error);
              if (data.done) break;
            } catch {
              // Skip malformed SSE chunks — non-fatal
            }
          }
        }

        if (!fullContent) {
          updateLastAssistantMessage("No response received. Please try again.");
          setStatus("idle");
          return;
        }

        // Speak response if TTS enabled and app is still active
        if (ttsEnabled && fullContent && isAppActive()) {
          setStatus("speaking");
          await speak(fullContent, selectedVoice);
        }

        setStatus("idle");
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Unknown error";
        updateLastAssistantMessage(toJarvisError(raw));
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    },
    [messages, addMessage, updateLastAssistantMessage, setStatus, ttsEnabled, selectedVoice, speak]
  );

  return { sendMessage };
}
