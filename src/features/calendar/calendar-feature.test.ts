import { createCalendarFeature } from "./calendar-feature.js";
import type { CalendarSearchPort } from "../../ports/calendar.js";
import {
  createFeatureContext,
  expectDecodedFeatureExecution,
  expectCapabilityMetadata,
  expectFeatureHandles,
} from "../../test-support/feature-contract.js";

const context = createFeatureContext();

describe("createCalendarFeature", () => {
  const createFeature = () => createCalendarFeature(createFakeCalendar());

  it("declares searchable calendar event metadata", () => {
    expectCapabilityMetadata(createFeature(), {
      name: "calendar.search_events",
      risk: "low",
      parameters: {
        endDate: { type: "string" },
        query: { type: "string" },
        startDate: { type: "string" },
      },
    });
  });

  it("handles calendar search commands", () => {
    expectFeatureHandles(
      createFeature(),
      "calendar.search_events",
      "alarm.create",
    );
  });

  it("returns the fixture wedding date", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.search_events",
      { query: "upcoming wedding" },
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

  it("returns upcoming events when no query is provided", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.search_events",
      {},
      {
        text: "Your upcoming calendar events are: Upcoming wedding on 2026-09-12.",
        data: {
          eventCount: 1,
        },
      },
      context,
    );
  });

  it("returns a deterministic no-upcoming-events response", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.search_events",
      { endDate: "2026-08-31", startDate: "2026-08-01" },
      {
        text: "I could not find any upcoming calendar events.",
      },
      context,
    );
  });

  it("returns a deterministic no-match response", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.search_events",
      { query: "dentist" },
      {
        text: 'I could not find a calendar event matching "dentist".',
      },
      context,
    );
  });
});

function createFakeCalendar(): CalendarSearchPort {
  return {
    searchEvents: (criteria) =>
      Promise.resolve(
        criteria.endDate === "2026-08-31"
          ? []
          : criteria.query === undefined ||
              criteria.query === "upcoming wedding"
            ? [
                {
                  id: "wedding-2026",
                  startDate: "2026-09-12",
                  title: "Upcoming wedding",
                },
              ]
            : [],
      ),
  };
}
