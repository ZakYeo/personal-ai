import type { AssistantConfig, AssistantResponse } from "../ports/assistant.js";
import { createAssistantConfig } from "./core-assistant.js";

export const deterministicNow = new Date("2026-06-26T09:00:00.000Z");
export const deterministicNowIso = deterministicNow.toISOString();

export const enabledDeterministicConfig = createAssistantConfig({
  calendar: { enabled: true },
  messaging: { enabled: true },
  alarms: { enabled: true },
});

export const defaultDeterministicConfig = createAssistantConfig({
  calendar: { enabled: true },
  messaging: { enabled: true },
  alarms: {
    enabled: true,
    confirmationRequiredCapabilities: ["alarm.create"],
  },
});

interface DeterministicScenario {
  text: string;
  response: AssistantResponse;
}

export const deterministicScenarios = {
  calendarWedding: {
    text: "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
    response: {
      status: "ok",
      text: "The upcoming wedding is on 2026-09-12.",
    },
  },
  messagingWhatsappDraft: {
    text: "Hey Jarvis, can you respond to that WhatsApp message for me?",
    response: {
      status: "ok",
      text: 'Drafted a whatsapp reply: "Thanks for the message. I will take a look and get back to you shortly."',
    },
  },
  alarmCreateWithoutConfirmation: {
    text: "Hey Jarvis, set an alarm to ping me in 10 minutes.",
    response: {
      status: "ok",
      text: "Alarm set for 2026-06-26T09:10:00.000Z (ping me).",
    },
  },
  alarmCreateNeedsConfirmation: {
    text: "Hey Jarvis, set an alarm to ping me in 10 minutes.",
    response: {
      status: "needs_confirmation",
      text: "I need confirmation before doing that. Please confirm yes or no.",
    },
  },
  alarmListEmpty: {
    text: "Hey Jarvis, list my alarms",
    response: {
      status: "ok",
      text: "There are no alarms set.",
    },
  },
  alarmListWithOne: {
    text: "Hey Jarvis, list my alarms",
    response: {
      status: "ok",
      text: "Alarms: alarm-1 at 2026-06-26T09:10:00.000Z (ping me).",
    },
  },
  unknown: {
    text: "Hey Jarvis, what is this?",
    response: {
      status: "unknown",
      text: "I could not map that to a deterministic command.",
    },
  },
  unsupportedCalendar: {
    text: "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
    response: {
      status: "unsupported",
      text: "I do not have an enabled feature for calendar.search_events.",
    },
  },
} as const satisfies Record<string, DeterministicScenario>;

export const disabledCalendarConfig: AssistantConfig = createAssistantConfig({
  calendar: { enabled: false },
  messaging: { enabled: true },
  alarms: { enabled: true },
});

export const runtimeFailureConfig: AssistantConfig = {
  assistant: {
    name: "",
    wakePhrases: ["hey jarvis"],
  },
  features: {},
};

export const runtimeFailureResponse: AssistantResponse = {
  status: "error",
  text: "I hit a problem and could not complete that.",
};

export const runtimeFailureDiagnostic =
  "Runtime failure: Config assistant.name must be a non-empty string.";
