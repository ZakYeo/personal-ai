import type { AssistantResponse } from "../ports/assistant.js";

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
  capabilityList: {
    text: "Hey Jarvis, what are your capable functionalities?",
    response: {
      status: "ok",
      text: "I can check your calendar, draft message replies, and manage local alarms. I will ask before creating an alarm.",
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
      status: "unknown",
      text: "I could not map that to a deterministic command.",
    },
  },
} as const satisfies Record<string, DeterministicScenario>;
