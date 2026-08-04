import type { AssistantToolObservation } from "../ports/intent.js";
import {
  assertToolObservationWithinLimit,
  toolObservationLimits,
} from "./tool-observation-policy.js";

describe("assertToolObservationWithinLimit", () => {
  it("accepts a compact scalar observation", () => {
    expect(() =>
      assertToolObservationWithinLimit({
        capability: "calendar.search_events",
        data: { count: 1, found: true, query: "dentist" },
        text: "I found one event.",
      }),
    ).not.toThrow();
  });

  it.each([
    {
      capability: "calendar.search_events",
      text: "x".repeat(toolObservationLimits.textCharacters + 1),
    },
    {
      capability: "calendar.search_events",
      data: Object.fromEntries(
        Array.from(
          { length: toolObservationLimits.dataFields + 1 },
          (_, index) => [`field${index}`, index],
        ),
      ),
      text: "Read.",
    },
    {
      capability: "calendar.search_events",
      data: {
        title: "x".repeat(toolObservationLimits.stringCharacters + 1),
      },
      text: "Read.",
    },
    {
      capability: "calendar.search_events",
      text: "unsafe\u0000text",
    },
  ] satisfies AssistantToolObservation[])(
    "rejects an observation outside an application bound",
    (observation) => {
      expect(() => assertToolObservationWithinLimit(observation)).toThrow(
        "A tool observation exceeded its application limit.",
      );
    },
  );
});
