import type { AssistantResponse } from "../ports/assistant.js";
import type { LoadedRuntimeConfig } from "../runtimes/config/config.js";
import { createLoadedRuntimeConfig } from "./core-assistant.js";
import { deterministicTestNow, deterministicTestNowIso } from "./primitives.js";

export const mockVoiceConfig = {
  input: "mock",
  wakeWord: "mock",
  speechToText: "mock",
  textToSpeech: "mock",
  audioOutput: "mock",
} satisfies NonNullable<LoadedRuntimeConfig["voice"]>;

export const deterministicNow = deterministicTestNow;
export const deterministicNowIso = deterministicTestNowIso;

export const enabledDeterministicConfig = createLoadedRuntimeConfig({
  calendar: { enabled: true, adapter: "mock", upcomingWindowDays: 92 },
  messaging: { enabled: true, adapter: "mock" },
  alarms: { enabled: true, adapter: "local" },
});

export const voiceEnabledDeterministicConfig: LoadedRuntimeConfig = {
  ...enabledDeterministicConfig,
  voice: mockVoiceConfig,
};

export const defaultDeterministicConfig = createLoadedRuntimeConfig({
  calendar: { enabled: true, adapter: "mock", upcomingWindowDays: 92 },
  messaging: { enabled: true, adapter: "mock" },
  alarms: {
    enabled: true,
    adapter: "local",
    confirmationRequiredCapabilities: ["alarm.create"],
  },
});

export const disabledCalendarConfig: LoadedRuntimeConfig =
  createLoadedRuntimeConfig({
    calendar: { enabled: false, upcomingWindowDays: 92 },
    messaging: { enabled: true, adapter: "mock" },
    alarms: { enabled: true, adapter: "local" },
  });

export const runtimeFailureConfig: LoadedRuntimeConfig = {
  assistant: {
    name: "",
    timeZone: "Europe/London",
    wakePhrases: ["hey jarvis"],
  },
  intent: enabledDeterministicConfig.intent,
  conversation: enabledDeterministicConfig.conversation,
  responseRewriter: enabledDeterministicConfig.responseRewriter,
  features: {},
};

export const runtimeFailureResponse: AssistantResponse = {
  status: "error",
  text: "I hit a problem and could not complete that.",
};

export const runtimeFailureDiagnostic =
  "Runtime failure: Config assistant.name must be a non-empty string.";
