import type {
  AssistantRuntimeEvent,
  PendingAssistantRuntimeEvent,
} from "../presentation/assistant-runtime-event-stream.js";

export interface VoicePresentationReporter {
  createInteractionId(): string;
  publish(event: PendingAssistantRuntimeEvent): AssistantRuntimeEvent;
}

export interface VoiceRuntimeIo {
  fallbackOutput?: { write(chunk: string): boolean | void };
  presentation?: VoicePresentationReporter;
  progressOutput?: { write(chunk: string): boolean | void };
  stderr?: { write(chunk: string): boolean | void };
}
