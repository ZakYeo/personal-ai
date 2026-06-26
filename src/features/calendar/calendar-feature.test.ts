import { createCalendarFeature } from "./calendar-feature.js";
import { createCommand } from "../../test-support/core-assistant.js";
import {
  createFeatureContext,
  expectCapabilityMetadata,
  expectFeatureExecution,
  expectFeatureHandles,
} from "../../test-support/feature-contract.js";

const context = createFeatureContext();

describe("createCalendarFeature", () => {
  it("declares searchable calendar event metadata", () => {
    expectCapabilityMetadata(createCalendarFeature(), {
      name: "calendar.search_events",
      risk: "low",
      parameters: {
        query: { type: "string", required: true },
      },
    });
  });

  it("handles calendar search commands", () => {
    expectFeatureHandles(
      createCalendarFeature(),
      "calendar.search_events",
      "alarm.create",
      context,
    );
  });

  it("returns the fixture wedding date", async () => {
    await expectFeatureExecution(
      createCalendarFeature(),
      createCommand("calendar.search_events", { query: "upcoming wedding" }),
      {
        text: "The upcoming wedding is on 2026-09-12.",
        data: {
          eventId: "wedding-2026",
          date: "2026-09-12",
          title: "Upcoming wedding",
        },
      },
      context,
    );
  });

  it("returns a deterministic no-match response", async () => {
    await expectFeatureExecution(
      createCalendarFeature(),
      createCommand("calendar.search_events", { query: "dentist" }),
      {
        text: 'I could not find a calendar event matching "dentist".',
      },
      context,
    );
  });
});
