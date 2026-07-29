import {
  createAssistant as createCoreAssistant,
  type AssistantDependencies,
} from "./assistant.js";
import { createCapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import {
  createAssistantConfig,
  createCommand,
  createFeature,
  createFixedClock,
  createInterpreter,
} from "../../test-support/core-assistant.js";
import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import type { AlarmStore } from "../../ports/alarm-store.js";
import type { ResponseRewriterPort } from "../../ports/response-rewriter.js";
import { createScheduledAlarmRecord } from "../../test-support/primitives.js";

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
          execute: () =>
            Promise.resolve({
              citations: [
                {
                  title: "Example source",
                  url: "https://example.com/source",
                },
              ],
              text: "Handled on 2026-09-12.",
            }),
        }),
      ],
      intentInterpreter: createInterpreter(command),
      responseRewriter: { rewrite },
    });

    await expect(assistant.handleText("echo hello")).resolves.toEqual({
      citations: [
        {
          title: "Example source",
          url: "https://example.com/source",
        },
      ],
      status: "ok",
      text: "Handled naturally.",
    });
    expect(rewrite).toHaveBeenCalledWith(
      {
        capability: "test.echo",
        command,
        originalText: "echo hello",
        response: {
          citations: [
            {
              title: "Example source",
              url: "https://example.com/source",
            },
          ],
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
