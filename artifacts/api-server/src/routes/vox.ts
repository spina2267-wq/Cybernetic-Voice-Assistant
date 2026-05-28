import { Router } from "express";
import OpenAI, { toFile } from "openai";
import { logger } from "../lib/logger";

const router = Router();

const SYSTEM_PROMPT = `You are VOX, an advanced AI assistant inspired by JARVIS from Iron Man. You are intelligent, precise, and articulate. Provide concise, helpful responses. Use clear, direct language. Do not use emojis. Format technical information cleanly. You adapt your tone to the user's needs — professional when needed, conversational otherwise.`;

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
      error:
        "AI service not configured. Set OPENAI_API_KEY environment variable or verify your Replit AI Credits.",
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

  try {
    const stream = await config.client.chat.completions.create({
      model: config.chatModel,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        })),
      ],
      stream: true,
      max_completion_tokens: 1024,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Chat streaming error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Streaming failed" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      res.end();
    }
  }
});

// POST /api/vox/transcribe — audio to text
router.post("/transcribe", async (req, res) => {
  const config = getOpenAI();
  if (!config) {
    return res.status(503).json({ error: "AI service not configured." });
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

// POST /api/vox/speak — text to audio
router.post("/speak", async (req, res) => {
  const config = getOpenAI();
  if (!config) {
    return res.status(503).json({ error: "AI service not configured." });
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

export default router;
