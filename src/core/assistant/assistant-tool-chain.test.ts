import { createAssistant } from "./assistant.js";
import { createCapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type {
  IntentInterpretation,
  IntentSessionContinuation,
} from "../../ports/intent.js";
import type { ResponseRewriteRequest } from "../../ports/response-rewriter.js";
import {
  createAssistantConfig,
  createFixedClock,
  createRawFeature,
} from "../../test-support/core-assistant.js";
import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import { createTestAlarmStore } from "../../test-support/alarm-store.js";

describe("assistant bounded tool chains", () => {
  it("rewrites only the terminal human response", async () => {
    const rewrite = vi.fn((request: ResponseRewriteRequest) =>
      Promise.resolve({ text: `Polished: ${request.response.text}` }),
    );
    const steps: IntentInterpretation[] = [
      {
        call: {
          command: command("calendar.search_events", {}),
          id: "read-1",
        },
        kind: "tool_call",
      },
      { command: command("alarm.list", {}), kind: "command" },
    ];
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          id: "calendar",
          capabilities: [
            {
              name: "calendar.search_events",
              risk: "low",
              toolChain: "read",
            },
          ],
          execute: () => Promise.resolve({ text: "Calendar read." }),
        }),
        createRawFeature({
          id: "alarms",
          capabilities: [{ name: "alarm.list", risk: "low" }],
          execute: () => Promise.resolve({ text: "No alarms." }),
        }),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({
        alarms: { enabled: true },
        calendar: { enabled: true },
      }),
      intentInterpreter: {
        start: () => ({ next: () => Promise.resolve(steps.shift()!) }),
      },
      responseRewriter: { rewrite },
    });

    await expect(assistant.handleText("check and list")).resolves.toEqual({
      status: "ok",
      text: "Polished: No alarms.",
    });
    expect(rewrite).toHaveBeenCalledTimes(1);
    expect(rewrite).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "alarm.list" }),
      expect.any(Object),
    );
  });

  it("executes an eligible read and returns only its safe observation to the session", async () => {
    const continuations: IntentSessionContinuation[] = [];
    const steps: IntentInterpretation[] = [
      {
        call: {
          command: command("calendar.search_events", { query: "dentist" }),
          id: "read-1",
        },
        kind: "tool_call",
      },
      {
        command: command("alarm.create", {
          scheduledFor: "2026-07-17T09:50:00.000Z",
        }),
        kind: "command",
      },
    ];
    const executions: string[] = [];
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          id: "calendar",
          displayName: "Calendar",
          capabilities: [
            {
              name: "calendar.search_events",
              parameters: { query: { type: "string" } },
              risk: "low",
              toolChain: "read",
            },
          ],
          execute: () => {
            executions.push("calendar.search_events");
            return Promise.resolve({
              data: { count: 1 },
              resultReferences: {
                items: [
                  {
                    facts: {
                      date: "2026-07-17",
                      startAt: "2026-07-17T10:00:00.000Z",
                      time: "11:00",
                      title: "Dentist",
                    },
                    target: {
                      kind: "calendar_event",
                      providerEventId: "provider-secret-event-id",
                    },
                  },
                ],
                kind: "calendar_events",
              },
              text: "I found Dentist at 11am.",
            });
          },
        }),
        createRawFeature({
          id: "alarms",
          displayName: "Alarms",
          capabilities: [
            {
              name: "alarm.create",
              parameters: { scheduledFor: { required: true, type: "string" } },
              risk: "low",
            },
          ],
          execute: () => {
            executions.push("alarm.create");
            return Promise.resolve({ text: "Alarm set." });
          },
        }),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({
        alarms: { enabled: true },
        calendar: { enabled: true },
      }),
      intentInterpreter: {
        start: () => ({
          next: (continuation) => {
            if (continuation) continuations.push(continuation);
            return Promise.resolve(steps.shift()!);
          },
        }),
      },
    });

    await expect(
      assistant.handleTextWithDiagnostics("remind me before the dentist"),
    ).resolves.toMatchObject({
      response: { status: "ok", text: "Alarm set." },
      toolChain: {
        calls: [
          {
            capability: "calendar.search_events",
            data: { count: 1 },
            status: "succeeded",
          },
        ],
      },
    });
    expect(executions).toEqual(["calendar.search_events", "alarm.create"]);
    expect(continuations).toEqual([
      {
        callId: "read-1",
        kind: "tool_result",
        observation: {
          capability: "calendar.search_events",
          data: { count: 1 },
          resultReferences: [
            {
              facts: {
                date: "2026-07-17",
                startAt: "2026-07-17T10:00:00.000Z",
                time: "11:00",
                title: "Dentist",
              },
              kind: "calendar_event",
              ordinal: 1,
              reference: "calendar-event-1",
            },
          ],
          text: "I found Dentist at 11am.",
        },
      },
    ]);
    expect(JSON.stringify(continuations)).not.toContain("provider-secret");
  });

  it("stops before a third sequential read call", async () => {
    let executions = 0;
    let continuations = 0;
    const steps: IntentInterpretation[] = [1, 2, 3].map((ordinal) => ({
      call: {
        command: command("calendar.search_events", { query: `${ordinal}` }),
        id: `read-${ordinal}`,
      },
      kind: "tool_call",
    }));
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          id: "calendar",
          capabilities: [
            {
              name: "calendar.search_events",
              parameters: { query: { type: "string" } },
              risk: "low",
              toolChain: "read",
            },
          ],
          execute: () => {
            executions++;
            return Promise.resolve({ text: "Read complete." });
          },
        }),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({ calendar: { enabled: true } }),
      intentInterpreter: {
        start: () => ({
          next: (continuation) => {
            if (continuation) continuations++;
            return Promise.resolve(steps.shift()!);
          },
        }),
      },
    });

    await expect(assistant.handleText("chain three reads")).resolves.toEqual({
      status: "unsupported",
      text: "I cannot safely complete that chained request.",
    });
    expect(executions).toBe(2);
    expect(continuations).toBe(2);
  });

  it("fails closed when a provider proposes a terminal capability as a read", async () => {
    let executed = false;
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          id: "alarms",
          capabilities: [{ name: "alarm.create", risk: "low" }],
          execute: () => {
            executed = true;
            return Promise.resolve({ text: "Alarm set." });
          },
        }),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({ alarms: { enabled: true } }),
      intentInterpreter: {
        start: () => ({
          next: () =>
            Promise.resolve({
              call: {
                command: command("alarm.create", {}),
                id: "unsafe-read",
              },
              kind: "tool_call",
            }),
        }),
      },
    });

    await expect(assistant.handleText("set an alarm")).resolves.toEqual({
      status: "unsupported",
      text: "I cannot safely complete that chained request.",
    });
    expect(executed).toBe(false);
  });

  it("retains one clarification and resumes the exact provider session", async () => {
    let starts = 0;
    const continuations: IntentSessionContinuation[] = [];
    const steps: IntentInterpretation[] = [
      {
        kind: "clarification",
        response: {
          expectsFollowUp: true,
          status: "ok",
          text: "What time should I use?",
        },
      },
      {
        command: command("alarm.create", {
          scheduledFor: "2026-07-17T09:00:00.000Z",
        }),
        kind: "command",
      },
    ];
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          id: "alarms",
          capabilities: [
            {
              name: "alarm.create",
              parameters: { scheduledFor: { required: true, type: "string" } },
              risk: "low",
            },
          ],
          execute: () => Promise.resolve({ text: "Alarm set." }),
        }),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({ alarms: { enabled: true } }),
      intentInterpreter: {
        start: () => {
          starts++;
          return {
            next: (continuation) => {
              if (continuation) continuations.push(continuation);
              return Promise.resolve(steps.shift()!);
            },
          };
        },
      },
    });

    await expect(assistant.handleText("remind me before it")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "What time should I use?",
    });
    await expect(assistant.handleText("ten am")).resolves.toEqual({
      status: "ok",
      text: "Alarm set.",
    });
    expect(starts).toBe(1);
    expect(continuations).toEqual([{ kind: "user_reply", text: "ten am" }]);
  });

  it("fails closed when a provider asks a second clarification", async () => {
    const steps: IntentInterpretation[] = [
      {
        kind: "clarification",
        response: { status: "ok", text: "First question?" },
      },
      {
        kind: "clarification",
        response: { status: "ok", text: "Second question?" },
      },
    ];
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([]),
      clock: createFixedClock(),
      config: createAssistantConfig({}),
      intentInterpreter: {
        start: () => ({ next: () => Promise.resolve(steps.shift()!) }),
      },
    });

    await assistant.handleText("start");
    await expect(assistant.handleText("answer")).resolves.toEqual({
      status: "unsupported",
      text: "I cannot safely complete that chained request.",
    });
  });

  it("binds a selected calendar event to one frozen confirmed alarm", async () => {
    const store = createTestAlarmStore();
    const steps: IntentInterpretation[] = [
      {
        call: {
          command: command("calendar.search_events", {}),
          id: "calendar-read",
        },
        kind: "tool_call",
      },
      {
        command: command("alarm.create_from_calendar_event", {
          minutesBefore: 10,
          reference: "calendar-event-2",
        }),
        kind: "command",
      },
    ];
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createCalendarResultFeature(),
        createAlarmFeature(store),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({
        alarms: { enabled: true },
        calendar: { enabled: true },
      }),
      intentInterpreter: {
        start: () => ({ next: () => Promise.resolve(steps.shift()!) }),
      },
    });

    const prompt = await assistant.handleText(
      "remind me ten minutes before the second event",
    );
    expect(prompt).toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm: 1. set the Dentist reminder alarm for 2026-07-17T09:50:00.000Z, 10 minutes before Dentist. Say yes or no.",
    });
    expect(JSON.stringify(prompt)).not.toContain("private-event");

    await expect(assistant.handleTextWithDiagnostics("yes")).resolves.toEqual({
      response: {
        status: "ok",
        text: "Alarm set for 2026-07-17T09:50:00.000Z (Dentist reminder), using the confirmed Dentist calendar snapshot.",
      },
      toolChain: {
        calls: [
          {
            capability: "calendar.search_events",
            status: "succeeded",
          },
        ],
      },
    });
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        label: "Dentist reminder",
        scheduledFor: "2026-07-17T09:50:00.000Z",
      }),
    ]);
  });

  it("clarifies an all-day event time before freezing its alarm", async () => {
    const store = createTestAlarmStore();
    const steps: IntentInterpretation[] = [
      {
        call: {
          command: command("calendar.search_events", {}),
          id: "all-day-read",
        },
        kind: "tool_call",
      },
      {
        command: command("alarm.create_from_calendar_event", {
          minutesBefore: 10,
          reference: "calendar-event-1",
        }),
        kind: "command",
      },
      {
        command: command("alarm.create_from_calendar_event", {
          localTime: "10am",
          minutesBefore: 10,
          reference: "calendar-event-1",
        }),
        kind: "command",
      },
    ];
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          id: "calendar",
          capabilities: [
            {
              name: "calendar.search_events",
              risk: "low",
              toolChain: "read",
            },
          ],
          execute: () =>
            Promise.resolve({
              resultReferences: {
                items: [
                  {
                    facts: {
                      date: "2026-07-17",
                      time: "all day",
                      title: "Birthday",
                    },
                    target: {
                      kind: "calendar_event" as const,
                      providerEventId: "private-all-day-event",
                    },
                  },
                ],
                kind: "calendar_events" as const,
              },
              text: "Birthday is all day.",
            }),
        }),
        createAlarmFeature(store),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({
        alarms: { enabled: true },
        calendar: { enabled: true },
      }),
      intentInterpreter: {
        start: () => ({ next: () => Promise.resolve(steps.shift()!) }),
      },
    });

    await expect(
      assistant.handleText("remind me before the birthday"),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "What time should I use for the all-day Birthday event?",
    });
    await expect(assistant.handleText("10am")).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm: 1. set the Birthday reminder alarm for 2026-07-17T08:50:00.000Z, 10 minutes before Birthday. Say yes or no.",
    });
    await assistant.handleText("yes");
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        scheduledFor: "2026-07-17T08:50:00.000Z",
      }),
    ]);
  });
});

function command(
  capability: string,
  parameters: Record<string, string | number>,
) {
  return {
    capability,
    parameters,
    rawText: "provider supplied text",
  };
}

function createCalendarResultFeature() {
  return createRawFeature({
    id: "calendar",
    displayName: "Calendar",
    capabilities: [
      { name: "calendar.search_events", risk: "low", toolChain: "read" },
    ],
    execute: () =>
      Promise.resolve({
        resultReferences: {
          items: [
            {
              facts: {
                date: "2026-07-17",
                startAt: "2026-07-17T08:00:00.000Z",
                time: "9:00",
                title: "Breakfast",
              },
              target: {
                kind: "calendar_event" as const,
                providerEventId: "private-event-1",
              },
            },
            {
              facts: {
                date: "2026-07-17",
                startAt: "2026-07-17T10:00:00.000Z",
                time: "11:00",
                title: "Dentist",
              },
              target: {
                kind: "calendar_event" as const,
                providerEventId: "private-event-2",
              },
            },
          ],
          kind: "calendar_events" as const,
        },
        text: "I found two events.",
      }),
  });
}
