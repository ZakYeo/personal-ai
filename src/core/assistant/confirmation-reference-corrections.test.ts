import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import type { IntentInterpretation } from "../../ports/intent.js";
import { createTestAlarmStore } from "../../test-support/alarm-store.js";
import {
  createAssistantConfig,
  createAssistantHarness,
  createCommand,
  createRawFeature,
} from "../../test-support/core-assistant.js";

function harness(questions: number) {
  const store = createTestAlarmStore();
  const calendar = createRawFeature({
    id: "calendar",
    capabilities: [{ name: "calendar.read", risk: "low" }],
    execute: () =>
      Promise.resolve({
        text: "Two upcoming events.",
        resultReferences: {
          kind: "calendar_events",
          items: [
            {
              facts: {
                date: "2026-09-08",
                startAt: "2026-09-08T12:00:00.000Z",
                time: "1pm",
                title: "First event",
              },
              target: {
                kind: "calendar_event",
                providerEventId: "private-first",
              },
            },
            {
              facts: {
                date: "2026-09-08",
                startAt: "2026-09-08T14:00:00.000Z",
                time: "3pm",
                title: "Second event",
              },
              target: {
                kind: "calendar_event",
                providerEventId: "private-second",
              },
            },
          ],
        },
      }),
  });
  const queue: IntentInterpretation[] = [
    { kind: "command", command: createCommand("calendar.read") },
    {
      kind: "command",
      command: createCommand("alarm.create_from_calendar_event", {
        reference: "calendar-event-1",
        minutesBefore: 10,
      }),
    },
    ...Array.from(
      { length: questions },
      (): IntentInterpretation => ({
        kind: "rephrase",
        response: { status: "ok", text: "Which event should I use?" },
      }),
    ),
    {
      kind: "command",
      command: createCommand("alarm.create_from_calendar_event", {
        reference: "calendar-event-2",
      }),
    },
  ];
  const assistant = createAssistantHarness({
    clock: { now: () => new Date("2026-09-07T12:00:00.000Z") },
    config: createAssistantConfig({
      alarms: { enabled: true },
      calendar: { enabled: true },
    }),
    features: [calendar, createAlarmFeature(store)],
    intentInterpreter: {
      start: () => ({
        next: () =>
          Promise.resolve(
            queue.shift() ?? {
              kind: "unknown",
              response: { status: "unknown", text: "Start again." },
            },
          ),
      }),
    },
  });
  return { assistant, store };
}

describe("opaque reference corrections", () => {
  it("reconfirms the other available event without retaining a provider target", async () => {
    const h = harness(0);
    await h.assistant.handleText("show my events");
    await h.assistant.handleText("remind me before the first one");
    const correctedOutcome =
      await h.assistant.handleTextWithDiagnostics("the other one");
    expect(correctedOutcome).toMatchObject({
      response: { status: "needs_confirmation" },
    });
    const corrected = correctedOutcome.response;
    expect(corrected.text).toContain("Second event");
    expect(await h.store.list()).toEqual([]);
    await h.assistant.handleText("yes");
    const alarms = await h.store.list();
    expect(alarms).toMatchObject([
      { scheduledFor: "2026-09-08T13:50:00.000Z" },
    ]);
    expect(JSON.stringify(alarms)).not.toContain("private-second");
  });
  it("refuses a correction after the displayed result references expire", async () => {
    const h = harness(2);
    await h.assistant.handleText("show my events");
    await h.assistant.handleText("remind me before the first one");
    await h.assistant.handleText("change the event");
    await h.assistant.handleText("another event");
    const outcome =
      await h.assistant.handleTextWithDiagnostics("the other one");
    expect(outcome.response.status).toBe("error");
    expect(outcome.diagnostics).not.toHaveLength(0);
    await h.assistant.handleText("yes");
    expect(await h.store.list()).toEqual([]);
  });
});
