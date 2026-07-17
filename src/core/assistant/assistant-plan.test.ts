import { createAssistant } from "./assistant.js";
import { createCapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type {
  FeatureExecutionContext,
  FeatureExecutionRequest,
  FeaturePlugin,
} from "../../ports/feature.js";
import type { AlarmRecord, AlarmStore } from "../../ports/alarm-store.js";
import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import { createScheduledAlarmRecord } from "../../test-support/primitives.js";
import {
  createAssistantConfig,
  createCommand,
  createFeature,
  createFixedClock,
  createInterpreter,
  requireConfirmationFor,
} from "../../test-support/core-assistant.js";

const clock = createFixedClock();

describe("assistant compound plans", () => {
  it("validates three commands before executing them in order with metadata", async () => {
    const calls: string[] = [];
    const features = ["first", "second", "third"].map((id, index) =>
      createFeature({
        id,
        capability: {
          name: `${id}.run`,
          risk: "low",
          summary: `Run ${id}.`,
          parameters: {},
        },
        execute: () => {
          calls.push(id);
          return Promise.resolve({
            data: { order: index + 1 },
            text: `${id} completed.`,
          });
        },
      }),
    );
    const assistant = createPlanAssistant(features, {
      kind: "plan",
      plan: {
        commands: features.map((feature) =>
          createCommand(feature.capabilities[0]!.name),
        ),
      },
    });

    await expect(
      assistant.handleTextWithDiagnostics("run all three"),
    ).resolves.toMatchObject({
      plan: {
        steps: [
          { data: { order: 1 }, status: "succeeded" },
          { data: { order: 2 }, status: "succeeded" },
          { data: { order: 3 }, status: "succeeded" },
        ],
      },
      response: {
        status: "ok",
        text: "first completed. second completed. third completed.",
      },
    });
    expect(calls).toEqual(["first", "second", "third"]);
  });

  it("executes no steps when any proposed command is invalid", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Executed." }));
    const feature = createFeature({ execute });
    const assistant = createPlanAssistant([feature], {
      kind: "plan",
      plan: {
        commands: [
          createCommand("test.echo"),
          createCommand("test.echo", { unsupported: true }),
        ],
      },
    });

    await expect(assistant.handleText("do both")).resolves.toMatchObject({
      status: "invalid",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("retains and resumes the exact validated plan", async () => {
    const command = createCommand("alarm.create", {
      label: "tea",
      minutesFromNow: 10,
    });
    const execute = vi.fn(() => Promise.resolve({ text: "Alarm created." }));
    const feature = createFeature({
      id: "alarms",
      capability: {
        name: "alarm.create",
        risk: "high",
        parameters: {
          label: { type: "string" },
          minutesFromNow: { type: "number", required: true },
        },
      },
      confirmation: (args) => ({
        facts: { label: args.label, minutesFromNow: args.minutesFromNow },
        text: `set ${String(args.label)} in ${String(args.minutesFromNow)} minutes`,
      }),
      execute,
    });
    const interpret = vi.fn(() =>
      Promise.resolve({
        kind: "plan" as const,
        plan: { commands: [createCommand("test.echo"), command] },
      }),
    );
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createFeature(),
        feature,
      ]),
      clock,
      config: createAssistantConfig({
        alarms: { enabled: true },
        test: { enabled: true },
      }),
      intentInterpreter: { start: () => ({ next: interpret }) },
    });

    await expect(assistant.handleText("do both")).resolves.toMatchObject({
      status: "needs_confirmation",
      text: expect.stringContaining("set tea in 10 minutes") as string,
    });
    command.parameters.label = "mutated";
    await assistant.handleText("yes");

    expect(interpret).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ args: { label: "tea", minutesFromNow: 10 } }),
      expect.any(Object),
    );
  });

  it("passes frozen confirmation facts to confirmed feature execution", async () => {
    const execute = vi.fn(
      (
        request: FeatureExecutionRequest,
        executionContext: FeatureExecutionContext,
      ) => {
        void request;
        void executionContext;
        return Promise.resolve({ text: "Created from frozen facts." });
      },
    );
    const feature = createFeature({
      capability: {
        name: "test.echo",
        requiresConfirmation: true,
        risk: "high",
        parameters: {},
      },
      confirmation: () => ({
        facts: { scheduledFor: "2026-07-17T09:50:00.000Z" },
        text: "create the frozen reminder",
      }),
      execute,
    });
    const assistant = createPlanAssistant([feature], createCommand());

    await assistant.handleText("create it");
    await assistant.handleText("yes");

    expect(execute).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        validatedConfirmationFacts: {
          scheduledFor: "2026-07-17T09:50:00.000Z",
        },
      }),
    );
  });

  it("executes a relative alarm at the exact time shown before the clock advances", async () => {
    let now = new Date("2026-06-26T09:00:00.000Z");
    const mutableClock = { now: () => now };
    let storedAlarm: AlarmRecord | undefined;
    const store: AlarmStore = {
      add: (alarm) => {
        storedAlarm = createScheduledAlarmRecord({
          ...alarm,
          id: "alarm-1",
        });
        return Promise.resolve(storedAlarm);
      },
      list: () => Promise.resolve(storedAlarm ? [storedAlarm] : []),
      removeTerminalBefore: () => Promise.resolve(0),
      update: () => Promise.resolve(undefined),
    };
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createFeature(),
        createAlarmFeature(store),
      ]),
      clock: mutableClock,
      config: createAssistantConfig({
        alarms: { enabled: true },
        test: { enabled: true },
      }),
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
          { capability: "test.echo", status: "succeeded" },
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

  it.each([
    {
      capability: {
        name: "test.echo",
        requiresConfirmation: true,
        risk: "low" as const,
        parameters: {},
      },
      config: createAssistantConfig(),
    },
    {
      capability: { name: "test.echo", risk: "low" as const, parameters: {} },
      config: requireConfirmationFor("test", ["test.echo"]),
    },
  ])(
    "fails the whole plan closed when confirmation has no renderer",
    async ({ capability, config }) => {
      const execute = vi.fn(() => Promise.resolve({ text: "Unsafe." }));
      const feature = createFeature({ capability, execute });
      const assistant = createPlanAssistant(
        [feature],
        {
          kind: "plan",
          plan: { commands: [createCommand(), createCommand()] },
        },
        config,
      );

      await expect(assistant.handleText("do both")).resolves.toMatchObject({
        status: "error",
      });
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("stops on failure and identifies skipped work", async () => {
    const laterExecute = vi.fn(() => Promise.resolve({ text: "Too late." }));
    const first = createFeature({
      id: "first",
      capability: {
        name: "first.read",
        risk: "low",
        summary: "Read the first item.",
        parameters: {},
      },
      execute: () => Promise.reject(new Error("provider detail")),
    });
    const second = createFeature({
      id: "second",
      capability: {
        name: "second.write",
        risk: "low",
        summary: "Write the second item.",
        parameters: {},
      },
      execute: laterExecute,
    });
    const assistant = createPlanAssistant([first, second], {
      kind: "plan",
      plan: {
        commands: [createCommand("first.read"), createCommand("second.write")],
      },
    });

    await expect(assistant.handleText("do both")).resolves.toEqual({
      status: "error",
      text: "I could not complete this step: Read the first item. I did not attempt this remaining step: Write the second item.",
    });
    expect(laterExecute).not.toHaveBeenCalled();
  });
});

function createPlanAssistant(
  features: FeaturePlugin[],
  interpretation: Parameters<typeof createInterpreter>[0],
  config = createAssistantConfig(
    Object.fromEntries(
      features.map((feature) => [feature.id, { enabled: true }]),
    ),
  ),
) {
  return createAssistant({
    capabilityRouting: createCapabilityRoutingIndex(features),
    clock,
    config,
    intentInterpreter: createInterpreter(interpretation),
  });
}
