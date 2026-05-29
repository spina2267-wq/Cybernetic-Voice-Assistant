import { fetch as expoFetch } from "expo/fetch";
import { useAssistant } from "@/context/AssistantContext";
import { isAppActive } from "@/hooks/useAppLifecycle";
import { useCallback, useRef } from "react";

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

// Map technical errors to JARVIS-style messages
function toJarvisError(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes("api key") || r.includes("unauthorized") || r.includes("401"))
    return "Authentication failure. AI credentials not configured.";
  if (r.includes("unavailable") || r.includes("503"))
    return "AI subsystem offline. Please try again.";
  if (r.includes("timeout") || r.includes("aborted"))
    return "Connection timeout. Signal lost.";
  if (r.includes("network") || r.includes("fetch"))
    return "Network unreachable. Check connection.";
  return raw.length > 120 ? "System error. Unable to process request." : raw;
}

/**
 * speakFn is provided by the caller (from a single shared useVoice instance).
 * This avoids a second useVoice instantiation which would create orphaned
 * AppState listeners, split soundRef state, and a disconnected isSpeaking flag.
 */
export function useAIStream(speakFn?: (text: string, voice: string) => Promise<void>) {
  const {
    messages,
    addMessage,
    updateLastAssistantMessage,
    commitLastAssistantMessage,
    setStatus,
    ttsEnabled,
    selectedVoice,
  } = useAssistant();

  // Keep a ref to messages so sendMessage doesn't need it as a dep.
  // Without this, sendMessage would be recreated on every streaming token
  // (every token updates messages, which invalidates the useCallback).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      // Snapshot history before adding new messages (newest-first → reverse for API)
      const history = [...messagesRef.current]
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

      // Placeholder assistant message for streaming
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
          const errMsg = toJarvisError(raw);
          commitLastAssistantMessage(errMsg);
          setStatus("error");
          setTimeout(() => setStatus("idle"), 3000);
          return;
        }

        // Stream tokens
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Abort streaming if app went to background — server will detect the
          // closed connection via req.on("close") and stop generating tokens.
          if (!isAppActive()) {
            reader.cancel().catch(() => {});
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                // updateLastAssistantMessage during streaming — no I/O
                updateLastAssistantMessage(fullContent);
              }
              if (data.error) throw new Error(data.error);
              if (data.done) break;
            } catch {
              // Skip malformed SSE chunks
            }
          }
        }

        if (!fullContent) {
          commitLastAssistantMessage("No response received. Please try again.");
          setStatus("idle");
          return;
        }

        // Commit final content to AsyncStorage atomically
        commitLastAssistantMessage(fullContent);

        // Speak if TTS enabled and app is still in foreground
        if (ttsEnabled && isAppActive() && speakFn) {
          setStatus("speaking");
          await speakFn(fullContent, selectedVoice);
        }

        setStatus("idle");
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Unknown error";
        commitLastAssistantMessage(toJarvisError(raw));
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    },
    // Intentionally omit 'messages' — use messagesRef.current instead
    // to prevent sendMessage from being recreated on every streaming token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addMessage, updateLastAssistantMessage, commitLastAssistantMessage, setStatus, ttsEnabled, selectedVoice, speakFn]
  );

  return { sendMessage };
}
