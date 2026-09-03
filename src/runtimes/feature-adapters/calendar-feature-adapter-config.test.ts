import { parseCalendarFeatureConfig } from "./calendar-feature-adapter-config.js";

describe("calendar feature adapter config", () => {
  it("defaults generic calendar searches to a 14-day window", () => {
    expect(
      parseCalendarFeatureConfig({
        eventGrouping: { provider: "mock" },
      }),
    ).toMatchObject({ upcomingWindowDays: 14 });
    expect(
      typeof parseCalendarFeatureConfig({
        eventGrouping: { provider: "mock" },
      }).eventGrouper.create,
    ).toBe("function");
  });

  it("keeps an explicit positive window override", () => {
    expect(
      parseCalendarFeatureConfig({
        eventGrouping: { provider: "mock" },
        upcomingWindowDays: 31,
      }),
    ).toMatchObject({ upcomingWindowDays: 31 });
  });

  it("requires an event grouping provider", () => {
    expect(() => parseCalendarFeatureConfig({})).toThrow(
      'Config feature "calendar".eventGrouping must be a JSON object.',
    );
  });
});
