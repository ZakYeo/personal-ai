import { deterministicTestNow } from "../../test-support/primitives.js";
import { protectResponseFacts } from "./response-fact-protection.js";

describe("protectResponseFacts", () => {
  it("protects expressed facts while leaving internal-only facts out of speech", () => {
    const protectedResponse = protectResponseFacts(
      "Dentist is on 2026-06-27.",
      {
        date: "2026-06-27",
        eventId: "private-event-id",
        title: "Dentist",
      },
      deterministicTestNow,
    );

    expect(protectedResponse.text).toBe(
      "__ASSISTANT_PROTECTED_FACT_1__ is on __ASSISTANT_PROTECTED_FACT_0__.",
    );
    expect(protectedResponse.facts).toEqual([
      { names: ["date"], token: "__ASSISTANT_PROTECTED_FACT_0__" },
      { names: ["title"], token: "__ASSISTANT_PROTECTED_FACT_1__" },
    ]);
    expect(
      protectedResponse.restore(
        "Your appointment, __ASSISTANT_PROTECTED_FACT_1__, is __ASSISTANT_PROTECTED_FACT_0__.",
      ),
    ).toBe("Your appointment, Dentist, is tomorrow.");
  });

  it("rejects duplicated and unknown fact tokens", () => {
    const protectedResponse = protectResponseFacts(
      "There are 2 events.",
      { eventCount: 2 },
      deterministicTestNow,
    );

    expect(() =>
      protectedResponse.restore(
        "__ASSISTANT_PROTECTED_FACT_0__ events, count __ASSISTANT_PROTECTED_FACT_0__.",
      ),
    ).toThrow(
      "Response rewrite changed protected fact token __ASSISTANT_PROTECTED_FACT_0__.",
    );
    expect(() =>
      protectedResponse.restore(
        "There are __ASSISTANT_PROTECTED_FACT_0__ events and __ASSISTANT_PROTECTED_FACT_9__ extras.",
      ),
    ).toThrow("Response rewrite introduced an unknown protected fact token.");
  });

  it("does not replace fact values inside tokens already inserted", () => {
    const protectedResponse = protectResponseFacts(
      "There are 2 events on 2026-07-17.",
      { date: "2026-07-17", eventCount: 2 },
      new Date("2026-07-13T09:00:00.000Z"),
    );

    expect(protectedResponse.text).toBe(
      "There are __ASSISTANT_PROTECTED_FACT_1__ events on __ASSISTANT_PROTECTED_FACT_0__.",
    );
    expect(
      protectedResponse.restore(
        "__ASSISTANT_PROTECTED_FACT_1__ events are on __ASSISTANT_PROTECTED_FACT_0__.",
      ),
    ).toBe("2 events are on this Friday.");
  });

  it.each([
    ["2026-07-12", "yesterday"],
    ["2026-07-13", "today"],
    ["2026-07-14", "tomorrow"],
    ["2026-07-17", "this Friday"],
    ["2026-07-20", "next Monday"],
    ["2026-07-26", "next Sunday"],
    ["2026-07-27", "27 July"],
    ["2027-01-02", "2 January 2027"],
    ["2026-02-30", "2026-02-30"],
  ])("restores the ISO date %s as %s", (date, expected) => {
    const protectedResponse = protectResponseFacts(
      `The event is on ${date}.`,
      { date },
      new Date("2026-07-13T09:00:00.000Z"),
    );

    expect(
      protectedResponse.restore(
        "The event is on __ASSISTANT_PROTECTED_FACT_0__.",
      ),
    ).toBe(`The event is on ${expected}.`);
  });
});
