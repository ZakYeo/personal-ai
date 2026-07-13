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
});
