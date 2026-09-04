import type { DesktopPresentationState } from "./desktop-state.js";

export const desktopShowcaseState = Object.freeze({
  connection: "connected",
  projection: {
    activity: [
      { occurredAt: "10:42am", summary: "Morning briefing completed" },
      { occurredAt: "9:15am", summary: "Weather watch checked" },
    ],
    alarms: [
      {
        id: "alarm-tea",
        label: "Tea break",
        scheduledFor: "11am",
        status: "scheduled",
      },
    ],
    integrations: [
      { label: "Calendar", status: "ready" },
      { label: "Weather", status: "ready" },
      { label: "Desktop voice", status: "ready" },
    ],
    interactions: [
      {
        id: "interaction-morning",
        request: "What needs my attention today?",
        response: "Two tasks and one calendar event need your attention.",
      },
    ],
    profile: [
      {
        field: "preferredName",
        provenance: "user-authored",
        value: "Zak",
      },
      {
        field: "homeLocation",
        provenance: "user-authored",
        value: "London",
      },
    ],
    sources: [
      { title: "Personal calendar", url: "https://example.com/calendar" },
      { title: "Weather forecast", url: "https://example.com/weather" },
    ],
    tasks: [
      { id: "task-review", label: "Review project notes", status: "open" },
      { id: "task-form", label: "Submit the form", status: "due today" },
    ],
    today: [
      "11am · Tea break alarm",
      "2pm · Product planning",
      "Two open tasks",
    ],
  },
  snapshot: {
    instanceId: "showcase-service",
    interaction: {
      confirmation: {
        prompt: "Send ‘Running five minutes late’ to Alex?",
      },
      id: "showcase-interaction",
      phase: "confirmation",
      transcript: "tell Alex I’m running five minutes late",
      updatedAt: "2026-09-04T10:42:00.000Z",
    },
    microphone: "available",
    sequence: 7,
    wakeListening: false,
  },
} satisfies DesktopPresentationState);
