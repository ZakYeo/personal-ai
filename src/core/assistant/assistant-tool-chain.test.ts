import { createAssistant } from "./assistant.js";
import { createCapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type {
  IntentInterpretation,
  IntentSessionContinuation,
} from "../../ports/intent.js";
import {
  createAssistantConfig,
  createFixedClock,
  createRawFeature,
} from "../../test-support/core-assistant.js";

describe("assistant bounded tool chains", () => {
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
        interpret: () => Promise.reject(new Error("one-shot path used")),
        start: () => ({
          next: (continuation) => {
            if (continuation) continuations.push(continuation);
            return Promise.resolve(steps.shift()!);
          },
        }),
      },
    });

    await expect(
      assistant.handleText("remind me before the dentist"),
    ).resolves.toEqual({ status: "ok", text: "Alarm set." });
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
        interpret: () => Promise.reject(new Error("one-shot path used")),
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
        interpret: () => Promise.reject(new Error("one-shot path used")),
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
        interpret: () => Promise.reject(new Error("one-shot path used")),
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
});

function command(capability: string, parameters: Record<string, string>) {
  return {
    capability,
    parameters,
    rawText: "provider supplied text",
  };
}
