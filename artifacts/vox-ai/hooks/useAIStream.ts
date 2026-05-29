import { fetch as expoFetch } from "expo/fetch";
import { useAssistant } from "@/context/AssistantContext";
import { useVoice } from "@/hooks/useVoice";
import { isAppActive } from "@/hooks/useAppLifecycle";
import { useCallback } from "react";

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

const getApiBase = () => `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

// Abort the initial connection if no data arrives within this window
const STREAM_CONNECT_TIMEOUT_MS = 40_000;

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
    commitLastAssistantMessage,
    setStatus,
    ttsEnabled,
    selectedVoice,
  } = useAssistant();
  const { speak } = useVoice();

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      // History snapshot before adding new messages (newest-first → reverse for API)
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

      const assistantMsg = {
        id: makeId(),
        role: "assistant" as const,
        content: "",
        timestamp: Date.now() + 1,
      };
      addMessage(assistantMsg);
      setStatus("thinking");

      let fullContent = "";

      // Abort if the initial connection takes too long
      const abortController = new AbortController();
      const connectTimeout = setTimeout(
        () => abortController.abort(),
        STREAM_CONNECT_TIMEOUT_MS
      );

      try {
        const apiMessages = [...history, { role: "user", content: content.trim() }];

        const response = await fetchWithRetry(`${getApiBase()}/vox/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          clearTimeout(connectTimeout);
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

        // First data received — cancel the connect timeout
        clearTimeout(connectTimeout);

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

            // Parse JSON separately so server errors propagate to the outer catch
            let data: { content?: string; error?: string; done?: boolean } | null = null;
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              continue; // Malformed chunk — skip silently
            }

            if (!data) continue;

            if (data.content) {
              fullContent += data.content;
              updateLastAssistantMessage(fullContent);
            }

            if (data.error) {
              reader.cancel().catch(() => {});
              throw new Error(data.error);
            }

            if (data.done) {
              reader.cancel().catch(() => {});
              break;
            }
          }
        }

        if (!fullContent) {
          commitLastAssistantMessage("No response received. Please try again.");
          setStatus("idle");
          return;
        }

        // Atomically set final content + persist — no race with updateLastAssistantMessage
        commitLastAssistantMessage(fullContent);

        if (ttsEnabled && isAppActive()) {
          setStatus("speaking");
          await speak(fullContent, selectedVoice);
        }

        setStatus("idle");
      } catch (err) {
        clearTimeout(connectTimeout);
        const raw = err instanceof Error ? err.message : "Unknown error";
        const errMsg = toJarvisError(raw);
        commitLastAssistantMessage(errMsg);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    },
    [messages, addMessage, updateLastAssistantMessage, commitLastAssistantMessage, setStatus, ttsEnabled, selectedVoice, speak]
  );

  return { sendMessage };
}
