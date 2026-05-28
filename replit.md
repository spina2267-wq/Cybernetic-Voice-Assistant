# VOX AI — Cybernetic Voice Assistant

A Jarvis-inspired AI voice assistant app (Expo mobile + API server) with streaming chat, voice recognition (STT), and text-to-speech (TTS).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/vox-ai run dev` — run the Expo mobile app (port 23680)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo ~54.0.27 + Expo Router ~6.0.17 (React Native 0.81.5)
- API: Express 5
- AI: OpenAI via Replit AI Integrations proxy (no API key required)
- Build: esbuild (CJS bundle for API server)

## Where things live

- `artifacts/vox-ai/` — Expo mobile app (main voice assistant UI)
- `artifacts/api-server/` — Express API server
- `artifacts/api-server/src/routes/vox.ts` — chat/transcribe/speak endpoints
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/api-client-react/` — generated React Query hooks
- `lib/api-zod/` — generated Zod validators
- `artifacts/vox-ai/context/AssistantContext.tsx` — conversation state + AsyncStorage
- `artifacts/vox-ai/hooks/useAIStream.ts` — streaming SSE chat hook
- `artifacts/vox-ai/hooks/useVoice.ts` — STT recording + TTS playback

## Architecture decisions

- VOX AI personality defined server-side in `vox.ts` SYSTEM_PROMPT (JARVIS-inspired)
- Streaming chat via SSE (text/event-stream) for real-time token display
- Voice recording uses `expo-av` → base64 → server-side Whisper transcription
- TTS: server-side OpenAI TTS → base64 MP3 → expo-av playback
- Conversation memory stored in AsyncStorage (up to 30 messages of context)
- `expo/fetch` used for streaming on all platforms (supports getReader())

## Product

- Voice input: tap mic → speak → auto-transcribed → sent to VOX AI
- Text input: type and send
- Streaming AI responses shown token-by-token
- TTS playback of AI responses (toggleable)
- Conversation history persisted across sessions
- Settings: TTS on/off, voice selection (alloy/echo/fable/onyx/nova/shimmer)
- History: view and clear past conversations
- Quick commands for common prompts
- Dark cyberpunk aesthetic with cyan/teal accents

## AI Integration

- Uses Replit AI Integrations proxy for OpenAI (no API key required)
- Env vars: `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` (auto-provisioned)
- Chat model: `gpt-5-mini` (via Replit proxy) or `gpt-4o-mini` (direct)
- STT: `gpt-4o-mini-transcribe` / `whisper-1`
- TTS: `tts-1`

## User preferences

- Do NOT delete or simplify existing features
- Do NOT change the cyberpunk/JARVIS aesthetic
- Do NOT break Android/Web compatibility
- Maintain all voice, TTS, STT, streaming, and memory features
- Minimize project size — no unnecessary caches or build artifacts

## Gotchas

- `expo-av` is deprecated in SDK 54 (warning only — still functional)
- Voice recording is disabled on web (Alert shown) — works in Expo Go on device
- Android permissions: RECORD_AUDIO, INTERNET, MODIFY_AUDIO_SETTINGS, VIBRATE
- Bundle ID: `com.voxai.assistant` — never change after initial setup
- Do not run `npx expo start` directly — use `restart_workflow` tool

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `expo` skill for React Native patterns and Expo-specific rules
