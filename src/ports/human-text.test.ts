import {
  humanizeSpokenText,
  isSpokenTextSafe,
  renderSpokenFact,
} from "./human-text.js";

const now = new Date("2026-08-04T15:10:13.032Z");

describe("human-facing text policy", () => {
  it.each([
    ["2026-08-04T15:00:00.000Z", "4pm today"],
    ["2026-08-05T08:30:00.000Z", "9:30am tomorrow"],
    ["2026-08-07T15:00:00.000Z", "4pm on Friday the 7th"],
    ["2026-09-11T15:00:00.000Z", "4pm on 11 September"],
    ["2027-01-02T16:00:00.000Z", "4pm on 2 January 2027"],
  ])("renders canonical instant %s as %s", (value, expected) => {
    expect(
      renderSpokenFact(value, {
        assistantTimeZone: "Europe/London",
        now,
        timeZone: "Europe/London",
      }),
    ).toBe(expected);
  });

  it("uses the subject timezone and names it when it differs from the assistant timezone", () => {
    expect(
      renderSpokenFact("2026-08-05T00:00:00.000Z", {
        assistantTimeZone: "Europe/London",
        now,
        timeZone: "Asia/Tokyo",
      }),
    ).toBe("9am today, Tokyo time");
  });

  it("renders dates, local times, and IANA timezone identifiers naturally", () => {
    expect(
      renderSpokenFact("2026-08-05", {
        assistantTimeZone: "Europe/London",
        now,
        timeZone: "Europe/London",
      }),
    ).toBe("tomorrow");
    expect(
      renderSpokenFact("13:05", {
        assistantTimeZone: "Europe/London",
        now,
        timeZone: "Europe/London",
      }),
    ).toBe("1:05pm");
    expect(
      renderSpokenFact("Europe/London", {
        assistantTimeZone: "Europe/London",
        now,
        timeZone: "Europe/London",
      }),
    ).toBe("London time");
  });

  it("humanizes machine timestamps and removes visible link targets", () => {
    expect(
      humanizeSpokenText(
        "Observed at 2026-08-04T15:00:00.000Z; fetched at 2026-08-04T15:10:13.032Z. Source: [Open-Meteo](https://open-meteo.com/) (https://open-meteo.com/).",
        {
          assistantTimeZone: "Europe/London",
          now,
          timeZone: "Europe/London",
        },
      ),
    ).toBe(
      "Observed at 4pm today; fetched at 4:10pm today. Source: Open-Meteo.",
    );
  });

  it("provides an idempotent final safety pass", () => {
    const options = {
      assistantTimeZone: "Europe/London",
      now,
      timeZone: "Europe/London",
    };
    const humanized = humanizeSpokenText(
      "See https://example.test/path for 2026-08-04T15:00:00.000Z.",
      options,
    );

    expect(humanizeSpokenText(humanized, options)).toBe(humanized);
    expect(isSpokenTextSafe(humanized)).toBe(true);
  });

  it.each([
    "See https://example.test/path.",
    "Read [the source](https://example.test/path).",
    "Observed at 2026-08-04T15:00:00.000Z.",
    "Scheduled in Europe/London.",
  ])("rejects machine-oriented spoken text: %s", (text) => {
    expect(isSpokenTextSafe(text)).toBe(false);
  });

  it("leaves malformed temporal values unchanged", () => {
    const options = {
      assistantTimeZone: "Europe/London",
      now,
      timeZone: "Europe/London",
    };
    expect(renderSpokenFact("2026-02-30", options)).toBe("2026-02-30");
    expect(renderSpokenFact("2026-08-04T15:00:00Z", options)).toBe(
      "2026-08-04T15:00:00Z",
    );
  });
});
