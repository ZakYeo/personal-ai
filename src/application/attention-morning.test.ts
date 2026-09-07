import { createCalendarBriefingSource } from "./briefing-sources.js";
import { createAttentionMorningSource } from "./attention-morning.js";
import { createInMemoryBriefingStore } from "../test-support/briefing-store.js";

it("uses only fixed morning sections and records the briefing baseline after presentation", async () => {
  const store = createInMemoryBriefingStore({
    now: () => new Date("2026-09-07T08:00:00.000Z"),
    timeZone: "Europe/London",
  });
  const internetRead = vi.fn(() => Promise.reject(new Error("must not read")));
  const source = createAttentionMorningSource({
    store,
    sources: [
      {
        section: "calendar",
        read: () =>
          Promise.resolve({
            section: "calendar",
            attention: [],
            facts: { title: "Planning" },
            items: [{ key: "event", text: "Planning is today." }],
          }),
      },
      { section: "internet", read: internetRead },
    ],
    reportDiagnostic: () => {},
  });
  const candidates = await source.read(
    new Date("2026-09-07T08:00:00.000Z"),
    "Europe/London",
  );
  expect(candidates[0]?.text).toContain("Planning");
  expect(candidates[0]?.text).toContain("unavailable");
  expect(internetRead).not.toHaveBeenCalled();
  expect(await store.getLastSnapshot()).toBeUndefined();
  await candidates[0]?.presentation?.record();
  expect(await store.getLastSnapshot()).toMatchObject({
    createdAt: "2026-09-07T08:00:00.000Z",
  });
});

it("bounds morning calendar facts before aggregation", async () => {
  const calendar = createCalendarBriefingSource(
    {
      searchEvents: () =>
        Promise.resolve(
          Array.from({ length: 10 }, (_, index) => ({
            id: String(index),
            title: `Event ${index}`,
            startDate: "2026-09-07",
          })),
        ),
      getEvent: () => Promise.resolve(undefined),
    },
    1,
  );
  const result = await calendar.read({
    now: new Date("2026-09-07T08:00:00.000Z"),
    timeZone: "Europe/London",
  });
  expect(result.items).toHaveLength(1);
  expect(Object.keys(result.facts)).toHaveLength(3);
});
