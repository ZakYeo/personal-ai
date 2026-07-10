import { createMockCalendar } from "./mock-calendar.js";
import { deterministicTestNow } from "../../test-support/primitives.js";

describe("createMockCalendar", () => {
  it("searches deterministic fixture events", async () => {
    const calendar = createMockCalendar();

    await expect(
      calendar.searchEvents(
        { query: "upcoming wedding" },
        { now: deterministicTestNow },
      ),
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
      calendar.searchEvents(
        { query: "dentist" },
        { now: deterministicTestNow },
      ),
    ).resolves.toEqual([]);
  });

  it("returns upcoming events when no query is provided", async () => {
    const calendar = createMockCalendar();

    await expect(
      calendar.searchEvents({}, { now: deterministicTestNow }),
    ).resolves.toEqual([
      {
        id: "wedding-2026",
        startDate: "2026-09-12",
        title: "Upcoming wedding",
      },
    ]);
  });

  it("filters upcoming events by date range", async () => {
    const calendar = createMockCalendar();

    await expect(
      calendar.searchEvents(
        { endDate: "2026-08-31", startDate: "2026-08-01" },
        { now: deterministicTestNow },
      ),
    ).resolves.toEqual([]);
  });
});
