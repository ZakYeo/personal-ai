import { parseCalendarFeatureConfig } from "./calendar-feature-adapter-config.js";

describe("calendar feature adapter config", () => {
  it("defaults generic calendar searches to a 14-day window", () => {
    expect(parseCalendarFeatureConfig({})).toEqual({
      upcomingWindowDays: 14,
    });
  });

  it("keeps an explicit positive window override", () => {
    expect(parseCalendarFeatureConfig({ upcomingWindowDays: 31 })).toEqual({
      upcomingWindowDays: 31,
    });
  });
});
