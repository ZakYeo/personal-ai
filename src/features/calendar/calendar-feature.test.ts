import { createCalendarFeature } from "./calendar-feature.js";
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

describe("createCalendarFeature", () => {
  it("handles calendar search commands", () => {
    const feature = createCalendarFeature();

    expect(
      feature.canHandle(createCommand("calendar.search_events"), context),
    ).toBe(true);
    expect(feature.canHandle(createCommand("alarm.create"), context)).toBe(
      false,
    );
  });

  it("returns the fixture wedding date", async () => {
    const feature = createCalendarFeature();

    await expect(
      feature.execute(
        createCommand("calendar.search_events", { query: "upcoming wedding" }),
        context,
      ),
    ).resolves.toEqual({
      text: "The upcoming wedding is on 2026-09-12.",
      data: {
        eventId: "wedding-2026",
        date: "2026-09-12",
        title: "Upcoming wedding",
      },
    });
  });

  it("returns a deterministic no-match response", async () => {
    const feature = createCalendarFeature();

    await expect(
      feature.execute(
        createCommand("calendar.search_events", { query: "dentist" }),
        context,
      ),
    ).resolves.toEqual({
      text: 'I could not find a calendar event matching "dentist".',
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
