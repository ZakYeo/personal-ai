import type { AssistantResponse } from "../../ports/assistant.js";
import type { VoiceTurnTimings } from "./voice-timings.js";

export interface VoiceTurnResult {
  response: AssistantResponse;
  spokenText?: string;
  status: "spoken" | "ignored" | "fallback_output";
  textOutputWritten: boolean;
  timings?: VoiceTurnTimings;
  transcript?: string;
  wakePhrase?: string;
}
