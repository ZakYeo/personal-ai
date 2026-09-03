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

  it("defaults the optional event grouper to the deterministic mock", async () => {
    const config = parseCalendarFeatureConfig({});
    const binding = config.eventGrouper.create({ env: {}, fetch: vi.fn() });

    expect(() => binding.validateStartup()).not.toThrow();
    await expect(binding.grouper.group({ events: [] })).resolves.toEqual({
      groups: [],
    });
  });
});
