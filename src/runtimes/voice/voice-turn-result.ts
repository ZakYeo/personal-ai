import type { AssistantResponse } from "../../ports/assistant.js";

export interface VoiceTurnResult {
  response: AssistantResponse;
  spokenText?: string;
  status: "spoken" | "ignored" | "fallback_output";
  textOutputWritten: boolean;
  transcript?: string;
  wakePhrase?: string;
}
