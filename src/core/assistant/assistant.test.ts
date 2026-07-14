import {
  createAssistant as createCoreAssistant,
  type AssistantDependencies,
} from "./assistant.js";
import { createCapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import {
  createAssistantConfig,
  createConversationCompactor,
  createCommand,
  createFeature,
  createFixedClock,
  createInterpreter,
  requireConfirmationFor,
} from "../../test-support/core-assistant.js";
import type { ConversationState } from "../../ports/conversation.js";
import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import type { AlarmStore } from "../../ports/alarm-store.js";
import type { ResponseRewriterPort } from "../../ports/response-rewriter.js";
import { createScheduledAlarmRecord } from "../../test-support/primitives.js";
import { createInMemoryAlarmStore } from "../../adapters/local/in-memory-alarm-store.js";

const config = createAssistantConfig({
  test: { enabled: true },
  disabled: { enabled: false },
});
const clock = createFixedClock();

function createAssistant(
  dependencies: Omit<AssistantDependencies, "capabilityRouting"> & {
    features: FeaturePlugin[];
  },
) {
  const { features, ...assistantDependencies } = dependencies;

  return createCoreAssistant({
    ...assistantDependencies,
    capabilityRouting: createCapabilityRoutingIndex(features),
  });
}

describe("createAssistant", () => {
  it("routes interpreted commands to an enabled feature", async () => {
    const command = createCommand("test.echo", { message: "hello" });
    const execute = vi.fn(() =>
      Promise.resolve({ text: "Handled deterministically." }),
    );
    const feature = createFeature({
      capability: {
        name: "test.echo",
        risk: "low",
        parameters: {
          message: { type: "string", required: true },
        },
      },
      execute,
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [feature],
      intentInterpreter: createInterpreter(command),
    });

    await expect(assistant.handleText(" hello ")).resolves.toEqual({
      status: "ok",
      text: "Handled deterministically.",
    });
    expect(execute).toHaveBeenCalledWith(
      {
        capability: "test.echo",
        command,
        args: { message: "hello" },
      },
      {
        capabilityCatalog: [
          {
            capability: feature.capabilities[0],
            featureId: "test",
            featureName: "Test",
            parameterText: "message: string (required)",
          },
        ],
        clock,
        config,
      },
    );
  });

  it("rewrites successful command responses when a response rewriter is configured", async () => {
    const command = createCommand("test.echo", { message: "hello" });
    const rewrite = vi.fn(() =>
      Promise.resolve({ text: "Handled naturally." }),
    );
    const assistant = createAssistant({
      clock,
      config,
      features: [
        createFeature({
          capability: {
            name: "test.echo",
            risk: "low",
            parameters: {
              message: { type: "string", required: true },
            },
          },
          execute: () => Promise.resolve({ text: "Handled on 2026-09-12." }),
        }),
      ],
      intentInterpreter: createInterpreter(command),
      responseRewriter: { rewrite },
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "ok",
      text: "Handled naturally.",
    });
    expect(rewrite).toHaveBeenCalledWith(
      {
        capability: "test.echo",
        command,
        originalText: "hello",
        response: {
          status: "ok",
          text: "Handled on 2026-09-12.",
        },
      },
      {
        clock,
        config,
      },
    );
  });

  it("keeps the original command response when response rewriting fails", async () => {
    const rewriteError = new Error("rewrite provider failure");
    const assistant = createAssistant({
      clock,
      config,
      features: [
        createFeature({
          execute: () => Promise.resolve({ text: "Handled on 2026-09-12." }),
        }),
      ],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
      responseRewriter: {
        rewrite: () => Promise.reject(rewriteError),
      },
    });

    await expect(assistant.handleTextWithDiagnostics("hello")).resolves.toEqual(
      {
        response: {
          status: "ok",
          text: "Handled on 2026-09-12.",
        },
        diagnostics: [
          {
            category: "response_rewrite_failure",
            capability: "test.echo",
            cause: rewriteError,
            message: "rewrite provider failure",
          },
        ],
      },
    );
  });

  it("protects feature facts and restores approved date renderings", async () => {
    const command = createCommand("test.echo");
    const rewrite = vi.fn(() =>
      Promise.resolve({
        text: "__ASSISTANT_PROTECTED_FACT_0__ is __ASSISTANT_PROTECTED_FACT_1__.",
      }),
    );
    const assistant = createAssistant({
      clock,
      config,
      features: [
        createFeature({
          execute: () =>
            Promise.resolve({
              data: {
                date: "2026-06-27",
                eventId: "private-event-id",
                title: "Zak: Dentist",
              },
              text: "Zak: Dentist is on 2026-06-27.",
            }),
        }),
      ],
      intentInterpreter: createInterpreter(command),
      responseRewriter: { rewrite },
    });

    await expect(assistant.handleText("when is the dentist?")).resolves.toEqual(
      {
        status: "ok",
        text: "Zak: Dentist is tomorrow.",
      },
    );
    expect(rewrite).toHaveBeenCalledWith(
      expect.objectContaining({
        protectedFacts: [
          { names: ["title"], token: "__ASSISTANT_PROTECTED_FACT_0__" },
          { names: ["date"], token: "__ASSISTANT_PROTECTED_FACT_1__" },
        ],
        response: {
          status: "ok",
          text: "__ASSISTANT_PROTECTED_FACT_0__ is on __ASSISTANT_PROTECTED_FACT_1__.",
        },
      }),
      { clock, config },
    );
  });

  it("falls back with diagnostics when a rewrite drops a protected count", async () => {
    const assistant = createAssistant({
      clock,
      config,
      features: [
        createFeature({
          execute: () =>
            Promise.resolve({
              data: { eventCount: 2 },
              text: "There are 2 upcoming events.",
            }),
        }),
      ],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
      responseRewriter: {
        rewrite: () => Promise.resolve({ text: "There are upcoming events." }),
      },
    });

    const outcome = await assistant.handleTextWithDiagnostics("what is next?");

    expect(outcome.response).toEqual({
      status: "ok",
      text: "There are 2 upcoming events.",
    });
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({
        category: "response_rewrite_failure",
        message:
          "Response rewrite changed protected fact token __ASSISTANT_PROTECTED_FACT_0__.",
      }),
    ]);
  });

  it("falls back when a rewrite changes persisted alarm-list facts", async () => {
    const store: AlarmStore = {
      add: () => Promise.reject(new Error("not used")),
      list: () =>
        Promise.resolve([
          createScheduledAlarmRecord({
            id: "alarm-1",
            label: "private appointment",
            scheduledFor: "2026-06-26T09:10:00.000Z",
          }),
        ]),
      removeTerminalBefore: () => Promise.resolve(0),
      update: () => Promise.resolve(undefined),
    };
    const assistant = createAssistant({
      clock,
      config: createAssistantConfig({ alarms: { enabled: true } }),
      features: [createAlarmFeature(store)],
      intentInterpreter: createInterpreter(createCommand("alarm.list")),
      responseRewriter: {
        rewrite: () => Promise.resolve({ text: "You have an alarm." }),
      },
    });

    const outcome = await assistant.handleTextWithDiagnostics("list alarms");

    expect(outcome.response).toEqual({
      status: "ok",
      text: "The private appointment alarm (alarm-1) is scheduled for 2026-06-26T09:10:00.000Z.",
    });
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({
        category: "response_rewrite_failure",
        message:
          "Response rewrite changed protected fact token __ASSISTANT_PROTECTED_FACT_0__.",
      }),
    ]);
  });

  it.each([
    {
      factName: "alarm0NextDeliveryAt",
      record: createScheduledAlarmRecord({
        id: "alarm-1",
        label: "tea",
        nextDeliveryAt: "2026-06-26T09:15:00.000Z",
        scheduledFor: "2026-06-26T09:10:00.000Z",
        status: "snoozed",
      }),
      text: "The tea alarm (alarm-1) is snoozed until 2026-06-26T09:15:00.000Z.",
    },
    {
      factName: "alarm0TerminalAt",
      record: createScheduledAlarmRecord({
        deliveryAttempts: 1,
        id: "alarm-1",
        label: "tea",
        nextDeliveryAt: undefined,
        scheduledFor: "2026-06-26T09:10:00.000Z",
        status: "completed",
        successfulDeliveries: 1,
        terminalAt: "2026-06-26T09:11:00.000Z",
      }),
      text: "The tea alarm (alarm-1) was completed at 2026-06-26T09:11:00.000Z.",
    },
    {
      factName: "alarm0RecurrenceFrequency",
      record: createScheduledAlarmRecord({
        id: "alarm-1",
        label: "tea",
        recurrence: { frequency: "daily", timeZone: "Europe/London" },
        scheduledFor: "2026-06-26T09:10:00.000Z",
      }),
      text: "The tea alarm (alarm-1) is scheduled for 2026-06-26T09:10:00.000Z and repeats daily in Europe/London.",
    },
    {
      factName: "alarm0RecurrenceTimeZone",
      record: createScheduledAlarmRecord({
        id: "alarm-1",
        label: "tea",
        recurrence: { frequency: "daily", timeZone: "Europe/London" },
        scheduledFor: "2026-06-26T09:10:00.000Z",
      }),
      text: "The tea alarm (alarm-1) is scheduled for 2026-06-26T09:10:00.000Z and repeats daily in Europe/London.",
    },
  ])(
    "protects $factName when rewriting alarm status",
    async ({ factName, record, text }) => {
      const store: AlarmStore = {
        add: () => Promise.reject(new Error("not used")),
        list: () => Promise.resolve([record]),
        removeTerminalBefore: () => Promise.resolve(0),
        update: () => Promise.resolve(undefined),
      };
      const assistant = createAssistant({
        clock,
        config: createAssistantConfig({ alarms: { enabled: true } }),
        features: [createAlarmFeature(store)],
        intentInterpreter: createInterpreter(createCommand("alarm.list")),
        responseRewriter: createFactChangingRewriter(factName),
      });

      const outcome = await assistant.handleTextWithDiagnostics("list alarms");

      expect(outcome.response).toEqual({ status: "ok", text });
      expect(outcome.diagnostics).toEqual([
        expect.objectContaining({ category: "response_rewrite_failure" }),
      ]);
    },
  );

  it("protects the next occurrence when rewriting recurring acknowledgement", async () => {
    const ringing = createScheduledAlarmRecord({
      deliveryAttempts: 1,
      id: "alarm-1",
      label: "tea",
      nextDeliveryAt: "2026-06-26T09:11:00.000Z",
      recurrence: { frequency: "daily", timeZone: "Europe/London" },
      scheduledFor: "2026-06-26T09:10:00.000Z",
      status: "ringing",
      successfulDeliveries: 1,
    });
    const store: AlarmStore = {
      add: () => Promise.reject(new Error("not used")),
      list: () => Promise.resolve([ringing]),
      removeTerminalBefore: () => Promise.resolve(0),
      update: () =>
        Promise.resolve(
          createScheduledAlarmRecord({
            id: "alarm-1",
            label: "tea",
            recurrence: { frequency: "daily", timeZone: "Europe/London" },
            revision: 3,
            scheduledFor: "2026-06-27T09:10:00.000Z",
          }),
        ),
    };
    const assistant = createAssistant({
      clock,
      config: createAssistantConfig({ alarms: { enabled: true } }),
      features: [createAlarmFeature(store)],
      intentInterpreter: createInterpreter(createCommand("alarm.acknowledge")),
      responseRewriter: createFactChangingRewriter("scheduledFor"),
    });

    const outcome = await assistant.handleTextWithDiagnostics("heard it");

    expect(outcome.response).toEqual({
      status: "ok",
      text: "Acknowledged the tea alarm. Its next occurrence is 2026-06-27T09:10:00.000Z.",
    });
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({ category: "response_rewrite_failure" }),
    ]);
  });

  it("emits rewrite diagnostics when the provider rejects without a cause", async () => {
    const assistant = createAssistant({
      clock,
      config,
      features: [
        createFeature({
          execute: () => Promise.resolve({ text: "Original safe response." }),
        }),
      ],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
      responseRewriter: {
        // The boundary must retain diagnostics for non-Error provider failures.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        rewrite: () => Promise.reject(undefined),
      },
    });

    await expect(assistant.handleTextWithDiagnostics("hello")).resolves.toEqual(
      {
        response: {
          status: "ok",
          text: "Original safe response.",
        },
        diagnostics: [
          {
            category: "response_rewrite_failure",
            capability: "test.echo",
            message: "Unknown response rewrite error",
          },
        ],
      },
    );
  });

  it("returns the interpreter response for unknown intent", async () => {
    const assistant = createAssistant({
      clock,
      config,
      features: [],
      intentInterpreter: {
        interpret: () =>
          Promise.resolve({
            kind: "unknown",
            response: {
              status: "unknown",
              text: "I could not map that to a deterministic command.",
            },
          }),
      },
    });

    await expect(assistant.handleText("what is this")).resolves.toEqual({
      status: "unknown",
      text: "I could not map that to a deterministic command.",
    });
  });

  it("returns unsupported when no enabled feature can handle the command", async () => {
    const disabledFeature = createFeature({
      id: "disabled",
      execute: () => Promise.resolve({ text: "Should not execute." }),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [disabledFeature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "unsupported",
      text: "I do not have an enabled feature for test.echo.",
    });
  });

  it("lets contextual feature predicates decline a declared capability", async () => {
    const feature = createFeature({
      canHandle: () => false,
      execute: () => Promise.resolve({ text: "Should not execute." }),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [feature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "unsupported",
      text: "I do not have an enabled feature for test.echo.",
    });
  });

  it("returns an error response when feature execution fails", async () => {
    const failingFeature = createFeature({
      execute: () =>
        Promise.reject(new Error("provider token secret fixture failure")),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [failingFeature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "error",
      text: "I could not complete that command.",
    });
  });

  it("preserves feature failure diagnostics for runtime boundaries", async () => {
    const cause = new Error("provider token secret fixture failure");
    const failingFeature = createFeature({
      execute: () => Promise.reject(cause),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [failingFeature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleTextWithDiagnostics("hello")).resolves.toEqual(
      {
        response: {
          status: "error",
          text: "I could not complete that command.",
        },
        diagnostics: [
          {
            category: "feature_failure",
            capability: "test.echo",
            cause,
            message: "provider token secret fixture failure",
          },
        ],
      },
    );
  });

  it("returns an invalid response without executing a malformed command", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Should not run." }));
    const feature = createFeature({
      capability: {
        name: "test.echo",
        risk: "low",
        parameters: {
          message: { type: "string", required: true },
        },
      },
      execute,
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [feature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "invalid",
      text: "I could not use that command: test.echo requires message.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not execute commands with non-finite numeric parameters", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Should not run." }));
    const feature = createFeature({
      capability: {
        name: "test.echo",
        risk: "low",
        parameters: {
          count: { type: "number", required: true },
        },
      },
      execute,
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [feature],
      intentInterpreter: createInterpreter({
        ...createCommand("test.echo"),
        parameters: {
          count: Number.NaN,
        },
      }),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "invalid",
      text: "I could not use that command: test.echo parameter count must be finite.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns a confirmation response without executing when policy requires confirmation", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Should not run." }));
    const assistant = createAssistant({
      clock,
      config: {
        ...requireConfirmationFor("test", ["test.echo"]),
      },
      features: [
        createFeature({
          confirmation: () => ({ facts: {}, text: "run the echo command" }),
          execute,
        }),
      ],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm: 1. run the echo command. Say yes or no.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes a pending command only after an explicit confirmation", async () => {
    const command = createCommand("test.echo", { message: "hello" });
    const execute = vi.fn(() =>
      Promise.resolve({ text: "Handled after confirmation." }),
    );
    const interpret = vi.fn(() =>
      Promise.resolve({ command, kind: "command" as const }),
    );
    const assistant = createAssistant({
      clock,
      config: requireConfirmationFor("test", ["test.echo"]),
      features: [
        createFeature({
          capability: {
            name: "test.echo",
            risk: "low",
            parameters: { message: { type: "string", required: true } },
          },
          confirmation: (args) => ({
            facts: { message: args.message },
            text: `echo ${args.message}`,
          }),
          execute,
        }),
      ],
      intentInterpreter: { interpret },
    });

    await assistant.handleText("do it");

    await expect(assistant.handleText("yes")).resolves.toEqual({
      status: "ok",
      text: "Handled after confirmation.",
    });
    expect(interpret).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("executes a relative alarm at the exact time shown before the clock advances", async () => {
    let now = new Date("2026-06-26T09:00:00.000Z");
    const mutableClock = { now: () => now };
    const store = createInMemoryAlarmStore({ now: () => now });
    const assistant = createAssistant({
      clock: mutableClock,
      config: createAssistantConfig({
        alarms: { enabled: true },
        test: { enabled: true },
      }),
      features: [createFeature(), createAlarmFeature(store)],
      intentInterpreter: createInterpreter({
        kind: "plan",
        plan: {
          commands: [
            createCommand("test.echo"),
            createCommand("alarm.create", {
              label: "tea",
              minutesFromNow: 10,
            }),
          ],
        },
      }),
    });

    await expect(assistant.handleText("set a tea alarm")).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm this plan: 1. set the tea alarm for 2026-06-26T09:10:00.000Z. Say yes or no.",
    });

    now = new Date("2026-06-26T09:05:00.000Z");
    await expect(
      assistant.handleTextWithDiagnostics("yes"),
    ).resolves.toMatchObject({
      plan: {
        steps: [
          {
            capability: "test.echo",
            status: "succeeded",
          },
          {
            data: {
              label: "tea",
              scheduledFor: "2026-06-26T09:10:00.000Z",
            },
            status: "succeeded",
          },
        ],
      },
      response: {
        status: "ok",
        text: "Handled. Alarm set for 2026-06-26T09:10:00.000Z (tea).",
      },
    });
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({
        label: "tea",
        scheduledFor: "2026-06-26T09:10:00.000Z",
      }),
    ]);
  });

  it("cancels a pending command after an explicit rejection", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Should not run." }));
    const assistant = createAssistant({
      clock,
      config: requireConfirmationFor("test", ["test.echo"]),
      features: [
        createFeature({
          confirmation: () => ({ facts: {}, text: "run the echo command" }),
          execute,
        }),
      ],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await assistant.handleText("do it");

    await expect(assistant.handleText("no")).resolves.toEqual({
      status: "ok",
      text: "Okay, I did not do that.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not interpret empty input", async () => {
    const interpret = vi.fn(() =>
      Promise.resolve({
        command: createCommand("test.echo"),
        kind: "command" as const,
      }),
    );
    const interpreter: IntentInterpreterPort = { interpret };
    const assistant = createAssistant({
      clock,
      config,
      features: [],
      intentInterpreter: interpreter,
    });

    await expect(assistant.handleText("   ")).resolves.toEqual({
      status: "unknown",
      text: "I need a command to help with.",
    });
    expect(interpret).not.toHaveBeenCalled();
  });

  it("answers conversation turns with chat history", async () => {
    const respond = vi
      .fn()
      .mockResolvedValueOnce({ status: "ok", text: "I am good." })
      .mockResolvedValueOnce({
        status: "ok",
        text: "I am still good because you asked earlier.",
      });
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: createConversationCompactor(),
        history: { maxTurnsBeforeCompaction: 5 },
        responder: { respond },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(
      assistant.handleText("Hey Jarvis, how are you today?"),
    ).resolves.toEqual({
      status: "ok",
      text: "I am good.",
    });
    await expect(assistant.handleText("what did I ask?")).resolves.toEqual({
      status: "ok",
      text: "I am still good because you asked earlier.",
    });

    expect(respond).toHaveBeenNthCalledWith(
      1,
      "Hey Jarvis, how are you today?",
      { recentTurns: [] },
      { clock, config },
    );
    expect(respond).toHaveBeenNthCalledWith(
      2,
      "what did I ask?",
      {
        recentTurns: [
          { content: "Hey Jarvis, how are you today?", role: "user" },
          { content: "I am good.", role: "assistant" },
        ],
      },
      { clock, config },
    );
  });

  it("compacts conversation history after the configured number of chats", async () => {
    const compact = vi.fn((state: ConversationState) =>
      Promise.resolve({
        recentTurns: [],
        summary: `summary for ${state.recentTurns.length} turns`,
      }),
    );
    const respond = vi.fn((input: string, state: ConversationState) =>
      Promise.resolve({
        status: "ok" as const,
        text: state.summary
          ? `answered ${input} with ${state.summary}`
          : `answered ${input}`,
      }),
    );
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: { compact },
        history: { maxTurnsBeforeCompaction: 2 },
        responder: { respond },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await assistant.handleText("first");
    await assistant.handleText("second");
    await expect(assistant.handleText("third")).resolves.toEqual({
      status: "ok",
      text: "answered third with summary for 4 turns",
    });

    expect(compact).toHaveBeenCalledTimes(1);
    expect(compact).toHaveBeenCalledWith(
      {
        recentTurns: [
          { content: "first", role: "user" },
          { content: "answered first", role: "assistant" },
          { content: "second", role: "user" },
          { content: "answered second", role: "assistant" },
        ],
      },
      { clock, config },
    );
  });

  it("does not answer conversation turns when conversation is not configured", async () => {
    const assistant = createAssistant({
      clock,
      config,
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(assistant.handleText("how are you?")).resolves.toEqual({
      status: "unknown",
      text: "I could not understand that command.",
    });
  });

  it("returns safe diagnostics when conversation response fails", async () => {
    const cause = new Error("provider secret failure");
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: createConversationCompactor(),
        history: { maxTurnsBeforeCompaction: 5 },
        responder: {
          respond: () => Promise.reject(cause),
        },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(
      assistant.handleTextWithDiagnostics("how are you?"),
    ).resolves.toEqual({
      diagnostics: [
        {
          category: "conversation_failure",
          cause,
          message: "provider secret failure",
        },
      ],
      response: {
        status: "error",
        text: "I could not answer that right now.",
      },
    });
  });

  it("does not commit conversation history when compaction fails", async () => {
    const cause = new Error("compaction failed");
    const respond = vi.fn((input: string, state: ConversationState) =>
      Promise.resolve({
        status: "ok" as const,
        text: `answered ${input} after ${state.recentTurns.length} turns`,
      }),
    );
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: {
          compact: () => Promise.reject(cause),
        },
        history: { maxTurnsBeforeCompaction: 1 },
        responder: { respond },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(assistant.handleTextWithDiagnostics("first")).resolves.toEqual(
      {
        diagnostics: [
          {
            category: "conversation_failure",
            cause,
            message: "compaction failed",
          },
        ],
        response: {
          status: "error",
          text: "I could not answer that right now.",
        },
      },
    );
    await expect(
      assistant.handleTextWithDiagnostics("second"),
    ).resolves.toEqual({
      diagnostics: [
        {
          category: "conversation_failure",
          cause,
          message: "compaction failed",
        },
      ],
      response: {
        status: "error",
        text: "I could not answer that right now.",
      },
    });
    expect(respond).toHaveBeenNthCalledWith(
      2,
      "second",
      { recentTurns: [] },
      { clock, config },
    );
  });
});

function createFactChangingRewriter(factName: string): ResponseRewriterPort {
  return {
    rewrite: (request) => {
      const fact = request.protectedFacts?.find(({ names }) =>
        names.includes(factName),
      );
      if (!fact) {
        return Promise.reject(new Error(`Missing protected fact ${factName}.`));
      }
      return Promise.resolve({
        text: request.response.text.replace(fact.token, "changed"),
      });
    },
  };
}
