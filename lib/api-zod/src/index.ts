// Zod validation schemas (values)
export * from "./generated/api";
// TypeScript type aliases — only export those that don't conflict with Zod schema names above
export type { HealthStatus } from "./generated/types";
export type { VoxChatRequest } from "./generated/types";
export type { VoxChatRequestMessagesItem } from "./generated/types";
export type { VoxError } from "./generated/types";
export type { VoxSpeakRequest } from "./generated/types";
export type { VoxTranscribeRequest } from "./generated/types";
// VoxSpeakResponse and VoxTranscribeResponse TypeScript types are omitted here
// because they conflict with identically-named Zod schemas in generated/api.
// Use z.infer<typeof VoxSpeakResponse> / z.infer<typeof VoxTranscribeResponse> instead.
