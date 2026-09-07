import type { AssistantResponse } from "../../ports/assistant.js";
import type { VoiceTurnTimings } from "./voice-timings.js";
import type { VoiceInterruptionRequest } from "./voice-interruption-monitor.js";

export interface VoiceTurnResult {
  interruption?: VoiceInterruptionRequest;
  response: AssistantResponse;
  spokenText?: string;
  status: "spoken" | "ignored" | "fallback_output" | "cancelled";
  textOutputWritten: boolean;
  timings?: VoiceTurnTimings;
  transcript?: string;
  wakePhrase?: string;
}
