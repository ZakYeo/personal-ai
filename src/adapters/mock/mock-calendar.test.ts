import { createMockCalendar } from "./mock-calendar.js";
import { deterministicTestNow } from "../../test-support/primitives.js";

describe("createMockCalendar", () => {
  it("searches deterministic fixture events", async () => {
    const calendar = createMockCalendar();

    await expect(
      calendar.searchEvents("upcoming wedding", { now: deterministicTestNow }),
    ).resolves.toEqual([
      {
        id: "wedding-2026",
        startDate: "2026-09-12",
        title: "Upcoming wedding",
      },
    ]);
  });

  it("returns no events when fixtures do not match", async () => {
    const calendar = createMockCalendar();

    await expect(
      calendar.searchEvents("dentist", { now: deterministicTestNow }),
    ).resolves.toEqual([]);
  });
});
