import {
  createAlarmFeature,
  createInMemoryAlarmStore,
} from "./alarm-feature.js";
import type {
  AssistantCommand,
  AssistantContext,
} from "../../ports/assistant.js";

const context: AssistantContext = {
  clock: {
    now: () => new Date("2026-06-26T09:00:00.000Z"),
  },
  config: {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    features: {},
  },
};

describe("createAlarmFeature", () => {
  it("handles alarm create and list commands", () => {
    const feature = createAlarmFeature(createInMemoryAlarmStore());

    expect(feature.canHandle(createCommand("alarm.create"), context)).toBe(
      true,
    );
    expect(feature.canHandle(createCommand("alarm.list"), context)).toBe(true);
    expect(
      feature.canHandle(createCommand("calendar.search_events"), context),
    ).toBe(false);
  });

  it("creates deterministic alarms using the injected clock", async () => {
    const feature = createAlarmFeature(createInMemoryAlarmStore());

    await expect(
      feature.execute(
        createCommand("alarm.create", {
          label: "ping me",
          minutesFromNow: 10,
        }),
        context,
      ),
    ).resolves.toEqual({
      text: "Alarm set for 2026-06-26T09:10:00.000Z (ping me).",
      data: {
        id: "alarm-1",
        label: "ping me",
        scheduledFor: "2026-06-26T09:10:00.000Z",
      },
    });
  });

  it("lists alarms from the in-memory store", async () => {
    const feature = createAlarmFeature(createInMemoryAlarmStore());

    await feature.execute(
      createCommand("alarm.create", {
        label: "ping me",
        minutesFromNow: 10,
      }),
      context,
    );

    await expect(
      feature.execute(createCommand("alarm.list"), context),
    ).resolves.toEqual({
      text: "Alarms: alarm-1 at 2026-06-26T09:10:00.000Z (ping me).",
    });
  });

  it("returns a deterministic empty-list response", async () => {
    const feature = createAlarmFeature(createInMemoryAlarmStore());

    await expect(
      feature.execute(createCommand("alarm.list"), context),
    ).resolves.toEqual({
      text: "There are no alarms set.",
    });
  });
});

function createCommand(
  capability: string,
  parameters: AssistantCommand["parameters"] = {},
): AssistantCommand {
  return {
    capability,
    parameters,
    rawText: "fixture",
  };
}
