import type { AssistantConfig, AssistantResponse } from "../ports/assistant.js";
import { createAssistantConfig } from "./core-assistant.js";

export const mockVoiceConfig = {
  input: "mock",
  wakeWord: "mock",
  speechToText: "mock",
  textToSpeech: "mock",
  audioOutput: "mock",
} satisfies NonNullable<AssistantConfig["voice"]>;

export const deterministicNow = new Date("2026-06-26T09:00:00.000Z");
export const deterministicNowIso = deterministicNow.toISOString();

export const enabledDeterministicConfig = createAssistantConfig({
  calendar: { enabled: true, adapter: "mock" },
  messaging: { enabled: true, adapter: "mock" },
  alarms: { enabled: true, adapter: "local" },
});

export const voiceEnabledDeterministicConfig: AssistantConfig = {
  ...enabledDeterministicConfig,
  voice: mockVoiceConfig,
};

export const defaultDeterministicConfig = createAssistantConfig({
  calendar: { enabled: true, adapter: "mock" },
  messaging: { enabled: true, adapter: "mock" },
  alarms: {
    enabled: true,
    adapter: "local",
    confirmationRequiredCapabilities: ["alarm.create"],
  },
});

export const disabledCalendarConfig: AssistantConfig = createAssistantConfig({
  calendar: { enabled: false },
  messaging: { enabled: true, adapter: "mock" },
  alarms: { enabled: true, adapter: "local" },
});

export const runtimeFailureConfig: AssistantConfig = {
  assistant: {
    name: "",
    wakePhrases: ["hey jarvis"],
  },
  intent: {
    provider: "deterministic",
  },
  features: {},
};

export const runtimeFailureResponse: AssistantResponse = {
  status: "error",
  text: "I hit a problem and could not complete that.",
};

export const runtimeFailureDiagnostic =
  "Runtime failure: Config assistant.name must be a non-empty string.";
