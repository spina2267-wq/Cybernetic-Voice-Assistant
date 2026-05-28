import { Router } from "express";
import OpenAI, { toFile } from "openai";
import { logger } from "../lib/logger";

const router = Router();

const SYSTEM_PROMPT = `You are VOX — an advanced artificial intelligence system. The personal AI of your user. You combine the precision of a supercomputer with the insight of a trusted advisor.

Core directives:
- Voice-first design: Keep responses concise. One to three sentences when possible. Expand only when detail is explicitly requested or the topic demands it.
- No markdown. No bullet points. No headers. No asterisks. Speak in clean, natural, flowing sentences suitable for voice output.
- Tone: calm authority. Slightly formal, never cold. Occasional dry wit is acceptable. Never sycophantic. Never verbose.
- Use acknowledgment phrases like "Of course.", "Understood.", "Certainly.", or "Right away." — sparingly and only when genuinely appropriate.
- Reference context from previous messages naturally, as a human would.
- When uncertain, say so directly and briefly. Never fabricate information.
- For real-time data like current time or weather: acknowledge you lack live access, suggest the user's device.
- Never introduce yourself unless directly asked. Never mention being a large language model unless asked.
- If asked who you are: respond with "I am VOX — your advanced intelligence system."
- If asked what you can do: give a brief, confident overview of your capabilities.
- For calculations, analysis, writing, and reasoning: respond with precision and confidence.`;

function getOpenAI() {
  const replitKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const replitBase = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const directKey = process.env["OPENAI_API_KEY"];

  if (replitKey && replitBase) {
    return {
      client: new OpenAI({ apiKey: replitKey, baseURL: replitBase }),
      chatModel: "gpt-5-mini",
      ttsModel: "tts-1" as const,
      sttModel: "gpt-4o-mini-transcribe" as const,
    };
  }

  if (directKey) {
    return {
      client: new OpenAI({ apiKey: directKey }),
      chatModel: "gpt-4o-mini",
      ttsModel: "tts-1" as const,
      sttModel: "whisper-1" as const,
    };
  }

  return null;
}

// POST /api/vox/chat — streaming SSE
router.post("/chat", async (req, res) => {
  const config = getOpenAI();
  if (!config) {
    return res.status(503).json({
      error: "AI service unavailable. Please verify your Replit AI Credits or set OPENAI_API_KEY.",
    });
  }

  const { messages } = req.body as {
    messages: Array<{ role: string; content: string }>;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Abort the OpenAI stream if client disconnects
  const controller = new AbortController();
  req.on("close", () => controller.abort());

  try {
    const stream = await config.client.chat.completions.create(
      {
        model: config.chatModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          })),
        ],
        stream: true,
        max_completion_tokens: 2048,
      },
      { signal: controller.signal }
    );

    for await (const chunk of stream) {
      if (res.destroyed) break;
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "AbortError") return;
    req.log.error({ err }, "Chat streaming error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Streaming failed" });
    } else if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
      res.end();
    }
  }
});

// POST /api/vox/transcribe — audio to text
router.post("/transcribe", async (req, res) => {
  const config = getOpenAI();
  if (!config) {
    return res.status(503).json({ error: "AI service unavailable." });
  }

  const { audio, format = "m4a" } = req.body as {
    audio: string;
    format?: string;
  };

  if (!audio) return res.status(400).json({ error: "audio (base64) required" });

  try {
    const buffer = Buffer.from(audio, "base64");
    const mimeType = `audio/${format}`;
    const filename = `audio.${format}`;
    const file = await toFile(buffer, filename, { type: mimeType });

    const transcription = await config.client.audio.transcriptions.create({
      file,
      model: config.sttModel,
      response_format: "json",
    });

    res.json({ text: transcription.text });
  } catch (err) {
    req.log.error({ err }, "Transcription error");
    res.status(500).json({ error: "Transcription failed" });
  }
});

// POST /api/vox/speak — text to audio (TTS)
router.post("/speak", async (req, res) => {
  const config = getOpenAI();
  if (!config) {
    return res.status(503).json({ error: "AI service unavailable." });
  }

  const { text, voice = "alloy" } = req.body as {
    text: string;
    voice?: string;
  };

  if (!text) return res.status(400).json({ error: "text required" });

  const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  const safeVoice = validVoices.includes(voice) ? voice : "alloy";

  try {
    const speech = await config.client.audio.speech.create({
      model: config.ttsModel,
      voice: safeVoice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      input: text.slice(0, 4096),
      response_format: "mp3",
    });

    const arrayBuffer = await speech.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    res.json({ audio: base64, format: "mp3" });
  } catch (err) {
    req.log.error({ err }, "TTS error");
    res.status(500).json({ error: "TTS generation failed" });
  }
});

// GET /api/vox/health — quick health check
router.get("/health", (_req, res) => {
  const config = getOpenAI();
  res.json({
    status: "ok",
    ai: config ? "configured" : "unconfigured",
    timestamp: Date.now(),
  });
});

export default router;
